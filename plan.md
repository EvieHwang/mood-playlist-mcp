# Plan: Core MCP Server

## Architecture

### High-Level Flow

```
Claude iOS/Web (Anthropic servers)
    ↓ OAuth 2.1 authenticated MCP request
Tailscale Funnel (public HTTPS)
    ↓ routes to local process
evBot Mac Mini (this server)
    ├── OAuth 2.1 endpoints (discovery, registration, authorize, token)
    ├── MCP protocol handler (tool discovery, execution)
    ├── Apple Music client (search, create playlist)
    ├── Unsplash client (cover images)
    └── Secrets: 1Password CLI or env vars
```

### Deployment Architecture: Tailscale Funnel on evBot

```
Internet
    ↓ HTTPS (Let's Encrypt via Tailscale)
https://eviebot.<tailnet>.ts.net
    ↓ Tailscale Funnel → localhost:3000
Node.js process (Streamable HTTP MCP server + co-located OAuth server)
    ↓ managed by launchd
evBot Mac Mini
```

**Components:**

- MCP server + OAuth server listen on localhost:3000
- Tailscale Funnel exposes it as public HTTPS
- `launchd` plist for auto-start and crash recovery
- Supergateway if stdio→HTTP bridging is needed (same pattern as Fastmail MCP)

### OAuth 2.1 Architecture

The server acts as both MCP resource server and OAuth authorization server in one process.

**Endpoints:**

|Path                                     |Method|Purpose                                                  |
|-----------------------------------------|------|---------------------------------------------------------|
|`/.well-known/oauth-protected-resource`  |GET   |Protected Resource Metadata (RFC 9728)                   |
|`/.well-known/oauth-authorization-server`|GET   |Authorization Server Metadata (RFC 8414)                 |
|`/register`                              |POST  |Dynamic Client Registration (RFC 7591)                   |
|`/authorize`                             |GET   |Authorization page — renders consent form                |
|`/authorize`                             |POST  |Consent submission — validates password, issues auth code|
|`/token`                                 |POST  |Token exchange — auth code → access token (JWT)          |
|`/mcp`                                   |POST  |MCP Streamable HTTP endpoint (requires Bearer token)     |

**Flow:**

```
1. Claude sends MCP request to /mcp
2. Server returns 401 with WWW-Authenticate header
3. Claude fetches /.well-known/oauth-protected-resource
4. Claude fetches /.well-known/oauth-authorization-server
5. Claude registers via POST /register → gets client_id
6. Claude redirects user to /authorize with PKCE challenge
7. User (Evie) enters pre-shared password on consent page
8. Server issues authorization code → redirects back to Claude
9. Claude exchanges code for JWT access token at /token
10. Claude retries MCP request with Authorization: Bearer <token>
11. All subsequent requests include the Bearer token
```

**Single-user simplification:**

- Consent page checks a pre-shared password (from 1Password), not a user database
- Client registrations stored in memory (only one client — Claude)
- JWTs signed with a server secret (from 1Password), no external key management
- Refresh tokens rotated on each use (public client requirement)

## Key Technical Decisions

### Secrets Management (evBot)

On evBot, secrets are loaded from **1Password CLI** (`op read`) at process startup, same pattern as the Fastmail MCP server:

```bash
export APPLE_TEAM_ID=$(op read "op://Eviebot/Apple MusicKit Team ID/credential")
export APPLE_KEY_ID=$(op read "op://Eviebot/Apple MusicKit Key ID/credential")
export APPLE_PRIVATE_KEY=$(op read "op://Eviebot/Apple MusicKit Private Key/credential")
export APPLE_MUSIC_USER_TOKEN=$(op read "op://Eviebot/Apple Music User Token/credential")
export UNSPLASH_ACCESS_KEY=$(op read "op://Eviebot/Unsplash Access Key/credential")
export OAUTH_CONSENT_PASSWORD=$(op read "op://Eviebot/Mood Playlist OAuth Consent Password/credential")
export JWT_SIGNING_SECRET=$(op read "op://Eviebot/Mood Playlist JWT Secret/credential")
```

`OAUTH_CONSENT_PASSWORD` is what Evie enters on the consent page during the OAuth flow.
`JWT_SIGNING_SECRET` is used to sign and verify access tokens.

### Apple Developer Token Generation

The Developer Token is a JWT:

```typescript
{
  header: { alg: "ES256", kid: APPLE_KEY_ID },
  payload: {
    iss: APPLE_TEAM_ID,
    iat: now,
    exp: now + 15777000, // ~6 months
  }
}
```

Sign with the .p8 private key using ES256 (ECDSA with P-256 and SHA-256). Use `jsonwebtoken` npm package.

Generate at cold start, cache in memory, regenerate when expired.

### Apple Music API Patterns

**Base URL:** `https://api.music.apple.com/v1`

**Headers (all requests):**

```
Authorization: Bearer {developer_token}
Music-User-Token: {music_user_token}
```

**Search catalog:**

```
GET /v1/catalog/us/search?term={query}&types=songs&limit=5
```

**Create playlist:**

```
POST /v1/me/library/playlists
{
  "attributes": {
    "name": "Playlist Name",
    "description": "Mood description"
  },
  "relationships": {
    "tracks": {
      "data": [
        { "id": "catalog-song-id", "type": "songs" }
      ]
    }
  }
}
```

**List playlists:**

```
GET /v1/me/library/playlists?limit=25
```

### Fuzzy Matching Strategy

```
Input: { title: "Autumn Leaves", artist: "Bill Evans" }

Step 1: Search "Autumn Leaves Bill Evans" → results
Step 2: If no results, search "Autumn Leaves" → results
Step 3: Score each result:
  - artist_score = stringSimilarity(result.artist, "Bill Evans")
  - title_score = stringSimilarity(result.title, "Autumn Leaves")
  - combined = (artist_score * 0.6) + (title_score * 0.4)
Step 4: If best combined score > 0.7 → auto-accept as "fuzzy"
Step 5: If best score < 0.4 → mark as "not_found"
Step 6: Between 0.4-0.7 → accept but flag in response
```

### Unsplash Integration

```
GET https://api.unsplash.com/search/photos?query={mood}&orientation=landscape&per_page=1
Authorization: Client-ID {UNSPLASH_ACCESS_KEY}
```

Take the first result’s `urls.regular` (1080px wide). Include in playlist description since programmatic artwork upload may not be supported.

## Dependencies

```json
{
  "@modelcontextprotocol/sdk": "latest",
  "@aws-sdk/client-secrets-manager": "^3",
  "jsonwebtoken": "^9",
  "string-similarity": "^4",
  "node-fetch": "^3"
}
```

Dev dependencies: `typescript`, `vitest`, `eslint`, `prettier`, `@types/node`, `@types/jsonwebtoken`

## Testing Strategy

- **Unit tests:** Fuzzy matching logic, Developer Token generation, tool input validation
- **Integration tests (manual):** Apple Music search, playlist creation, Unsplash fetch
- **End-to-end (manual):** Full flow from Claude iOS → playlist in library

Automated tests cover the deterministic logic. API integration is tested manually because it requires live credentials and creates real playlists.

## Risks

|Risk                                    |Likelihood|Mitigation                                                        |
|----------------------------------------|----------|------------------------------------------------------------------|
|OAuth flow fails in claude.ai connectors|Medium    |Known bug reports exist; troubleshoot live against actual behavior|
|Music User Token expires unexpectedly   |Medium    |Token refresh mechanism; auth page for re-auth                    |
|Tailscale Funnel unreliable             |Low-Medium|Funnel proven with Fastmail MCP; launchd auto-restart             |
|Apple Music API rate limiting           |Low       |Only a few requests/week; no mitigation needed                    |
|Playlist artwork API limitations        |High      |Fall back to including image URL in description                   |
|evBot power/network outage              |Low       |macOS auto-restart configured; not mission-critical               |