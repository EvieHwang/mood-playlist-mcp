# Spec: Core MCP Server

## Summary

Build and deploy a remote MCP server that Claude can call to create Apple Music playlists from mood descriptions. The server exposes three tools: `create_mood_playlist`, `search_apple_music`, and `list_my_playlists`.

## Requirements

### R1: MCP Server Framework

The server must implement the MCP protocol using the official TypeScript SDK (`@modelcontextprotocol/sdk`). It must expose tools that Claude can discover and call via the remote MCP connector.

The server must support the Streamable HTTP transport (required for remote/cloud deployment). SSE and stdio are not needed.

### R2: OAuth 2.1 Authorization

The server implements OAuth 2.1 per the MCP Authorization Specification (2025-11-25 revision). The MCP server acts as both the **resource server** and a co-located **authorization server** (single-user, no need for external IdP).

**Discovery endpoints:**

- `/.well-known/oauth-protected-resource` — Protected Resource Metadata (RFC 9728). Points clients to the authorization server. Also advertised via `WWW-Authenticate` header on 401 responses.
- `/.well-known/oauth-authorization-server` — Authorization Server Metadata (RFC 8414). Describes endpoints, supported grant types, PKCE requirement.

**Client registration:**

- Support **Dynamic Client Registration** (RFC 7591) at `POST /register`. Claude.ai uses DCR to register itself as a client.
- Support **Client ID Metadata Documents** (CIMD) if straightforward to add, but DCR is the priority since Claude.ai is the known client.

**Authorization flow:**

1. Client (Claude) sends MCP request → server returns `401 Unauthorized` with `WWW-Authenticate: Bearer resource_metadata="..."`.
1. Client discovers authorization server via Protected Resource Metadata.
1. Client registers via DCR → receives `client_id`.
1. Client initiates Authorization Code flow with PKCE (`S256`).
1. Server renders consent page → user (Evie) authenticates with a pre-shared password.
1. Server issues authorization code → client exchanges for access token (with `resource` parameter per RFC 8707).
1. Client includes `Authorization: Bearer <token>` on all subsequent MCP requests.

**Single-user simplification:**

- The consent page checks a pre-shared password (stored in 1Password) rather than a user database.
- Only one user can authorize. No user registration, no account management.
- Client registrations can be stored in memory (single client — Claude — and re-registration is cheap).

**Token requirements:**

- Access tokens are JWTs signed with a server secret.
- Tokens MUST be validated on every HTTP request.
- Tokens MUST be audience-bound to this server’s URL.
- Invalid/expired tokens return `401 Unauthorized`.
- Refresh tokens MUST be rotated (public client).

### R3: Apple Music Integration

The server must authenticate with the Apple Music API using:

- **Developer Token:** A JWT signed with the Apple private key (.p8), refreshed before expiry (max 6 months)
- **Music User Token:** Obtained once via a MusicKit JS browser page, stored in 1Password

The server must support:

- **Catalog search:** Find songs by title + artist query
- **Playlist creation:** Create a new playlist in the user’s library with name, description, and track list
- **Playlist listing:** List existing playlists in the user’s library

### R4: Tool — `create_mood_playlist`

**Input:**

- `mood` (string) — mood description for cover image search and playlist description
- `songs` (array of `{title: string, artist: string}`) — Claude’s picks, typically 5
- `playlist_name` (string) — evocative name Claude generates

**Behavior:**

1. For each song, search Apple Music catalog for `{title} {artist}`
1. Apply fuzzy matching: if no exact match, accept the closest result if confidence is high (same artist, similar title — e.g., live version, remaster, different album). Auto-accept high-confidence matches silently.
1. If a song genuinely can’t be found (wrong artist, no close match), include it in the response as a gap
1. Fetch a cover image from Unsplash using the mood string
1. Create the playlist in Apple Music with the matched tracks
1. Return: playlist name, final track list (noting any substitutions), any gaps for Claude to fill

**Output:**

```typescript
{
  playlist_name: string;
  tracks_added: Array<{
    requested: { title: string; artist: string };
    matched: { title: string; artist: string; album: string; apple_music_id: string };
    match_type: "exact" | "fuzzy" | "not_found";
  }>;
  cover_image_url?: string;
  apple_music_playlist_url?: string;
}
```

### R5: Tool — `search_apple_music`

**Input:**

- `query` (string) — search terms
- `type` (string, default “songs”) — songs, albums, or artists
- `limit` (number, default 5)

**Output:** Array of results with id, name, artist, album.

Utility tool for when Claude wants to explore the catalog directly.

### R6: Tool — `list_my_playlists`

**Input:**

- `limit` (number, default 25)

**Output:** Array of playlist names, IDs, and track counts.

Useful for avoiding duplicate names or checking what exists.

### R7: Fuzzy Matching

When an exact catalog match isn’t found for a song, the server must:

1. Search Apple Music for `{title} {artist}`
1. If no results, try `{title}` alone
1. Score results on: artist name similarity, title similarity, popularity
1. Auto-accept if: same artist (fuzzy match) AND title is a close match (e.g., “Re: Stacks” vs “Re:Stacks”, “Say It Ain’t So” vs “Say It Ain’t So - Remastered”)
1. Mark as `not_found` only if no result has both a plausible artist and title match

Use a string similarity library (e.g., `string-similarity` or Levenshtein distance). Don’t over-engineer this — 80% accuracy on fuzzy matching is fine for v1.

### R8: Unsplash Cover Images

Fetch a thematic image from Unsplash using the mood description. Use the Unsplash API search endpoint. Pick the first landscape-oriented result. Return the URL for playlist description (and artwork if the Apple Music API supports it).

### R9: MusicKit JS Auth Page

A standalone HTML page (`auth-page/index.html`) that:

1. Loads MusicKit JS with the Developer Token
1. Prompts the user to sign in with their Apple ID
1. Captures the Music User Token
1. Displays it for the user to copy and store in 1Password

This is a one-time setup tool, not part of the running server.

### R10: Deployment

**Tailscale Funnel on evBot (Mac Mini)**

The server runs as a persistent process on evBot (the Mac Mini dev server), exposed to the internet via Tailscale Funnel. This matches the architecture already proven with the Fastmail MCP server.

- Server runs via `node` as a Streamable HTTP server on localhost:3000
- Tailscale Funnel provides public HTTPS URL: `https://eviebot.<tailnet>.ts.net`
- `launchd` service for persistence (auto-restart on crash, start on boot)
- OAuth 2.1 endpoints co-located in the same process (see R2)

### R11: CI/CD

GitHub Actions workflows:

- **ci.yml:** Lint, typecheck, test on PRs

## Success Criteria

1. From Claude iOS, user can describe a mood and a playlist appears in their Apple Music library within 30 seconds
1. Fuzzy matching finds reasonable substitutes for at least 80% of songs that don’t have exact matches
1. Cover images are thematically appropriate (subjective, tested manually)
1. OAuth flow works — Claude can discover, authenticate, and call tools via the connector

## Benchmark Test

Use this mood description to validate the complete pipeline:

> “February weather — dry, cold, clear but wintry. Japanese tea ceremony minimalism meets Scandinavian raw wood architecture meets hygge. Existing in coldness and bleak austerity, knowing spring is coming, adapted and no longer bothered. Soothing.”

Expected seed artists: Nils Frahm, Ólafur Arnalds, and similar.

All 5 tracks should resolve in the Apple Music catalog. Autoplay should continue with artists like Max Richter, Joep Beving, Ryuichi Sakamoto.