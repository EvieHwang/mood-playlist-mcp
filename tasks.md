# Tasks: Core MCP Server

## Prerequisites (Human — before running these tasks)

- [ ] **P1:** Apple Developer Program enrolled, Team ID and Key ID noted
- [ ] **P2:** MusicKit private key (.p8) downloaded and stored in 1Password "Eviebot" vault
- [ ] **P3:** Unsplash developer account created, Access Key stored in 1Password "Eviebot" vault
- [ ] **P4:** GitHub repo `EvieHwang/mood-playlist-mcp` created with these spec files committed
- [ ] **P5:** 1Password items created in "Eviebot" vault: `Apple MusicKit Team ID`, `Apple MusicKit Key ID`, `Apple MusicKit Private Key`, `Unsplash Access Key`, `Mood Playlist OAuth Consent Password`, `Mood Playlist JWT Secret`. (Music User Token added later in T19.)
- [ ] **P6:** Tailscale Funnel enabled on EvieBot (if not already from Fastmail MCP setup)

-----

## Phase 1: Project Scaffolding

### T1: Initialize TypeScript project

- [x] `npm init` with project metadata
- [x] Install dependencies per plan.md
- [x] Configure `tsconfig.json` (strict mode, ES2022 target, NodeNext module)
- [x] Configure ESLint + Prettier
- [x] Configure Vitest
- [x] Create directory structure per CLAUDE.md file tree
- [x] Verify: `npm run build` succeeds

### T2: HTTP server scaffolding

- [x] Set up Express HTTP server in `src/index.ts`
- [x] Configure to listen on `localhost:3000` (port configurable via `PORT` env var)
- [x] Add health check endpoint: `GET /health` → `200 OK`

### T3: Environment configuration

- [x] Create `src/lib/config.ts` — load and validate all required environment variables at startup
- [x] Type the config object (all expected keys)
- [x] Fail fast with clear error if any required env var is missing
- [x] Write unit test: verify missing vars throw, present vars load correctly
- [x] Verify: tests pass (4 tests)

-----

## Phase 2: Apple Music Integration

### T4: Developer Token generation

- [x] Implement `src/auth/apple-tokens.ts` — `generateDeveloperToken()`
- [x] Sign JWT with ES256 using the .p8 private key from environment variable
- [x] Cache token in memory, regenerate when within 1 day of expiry
- [x] Write unit test: verify JWT structure, claims, and signature algorithm
- [x] Verify: tests pass (4 tests)

### T5: Apple Music API client

- [x] Implement `src/lib/apple-music-client.ts`
- [x] Methods: `searchCatalog(query, type, limit)`, `createPlaylist(name, description, trackIds)`, `listPlaylists(limit)`
- [x] All methods include Developer Token + Music User Token headers
- [x] Handle error responses with clear error messages
- [x] Verify: compiles and types check

### T6: Fuzzy matching

- [x] Implement `src/lib/fuzzy-match.ts`
- [x] Input: `{title, artist}` + Apple Music search results
- [x] Output: `{matched_track, match_type, confidence_score}` or `not_found`
- [x] Scoring: artist similarity (60% weight) + title similarity (40% weight)
- [x] Thresholds: >0.85 exact, >0.4 fuzzy, <0.4 reject
- [x] Write unit tests (6 tests including exact, fuzzy, album variant, not_found)
- [x] Verify: all tests pass

-----

## Phase 3: MCP Tools

### T7: MCP server skeleton

- [x] Implement `src/index.ts` — initialize MCP server with Streamable HTTP transport
- [x] Register tool definitions (name, description, input schema via Zod) for all three tools
- [x] Wire up request handler that routes tool calls to implementations
- [x] Session management for Streamable HTTP (POST/GET/DELETE on /mcp)

### T8: `search_apple_music` tool

- [x] Implement `src/tools/search-apple-music.ts`
- [x] Input validation: query required, type defaults to "songs", limit defaults to 5
- [x] Call Apple Music client, format results
- [x] Return: array of `{id, name, artist, album}`

### T9: `create_mood_playlist` tool

- [x] Implement `src/tools/create-mood-playlist.ts`
- [x] For each song: search catalog → fuzzy match → collect track IDs
- [x] Fetch Unsplash image for mood string
- [x] Create playlist with matched tracks
- [x] Return structured response per spec.md R4
- [x] Handle partial failures: if 3/5 match, create playlist with 3 and report gaps

### T10: `list_my_playlists` tool

- [x] Implement `src/tools/list-playlists.ts`
- [x] Input: optional limit (default 25)
- [x] Call Apple Music client
- [x] Return: array of `{name, id, track_count}`

### T11: Unsplash integration

- [x] Implement `src/lib/unsplash.ts`
- [x] Search for landscape photos matching mood query
- [x] Return first result's regular URL (1080px)
- [x] Handle no-results gracefully (return null, don't fail the playlist creation)

-----

## Phase 4: OAuth 2.1 + Deployment

### T12: OAuthServerProvider implementation

- [x] Implement `src/auth/oauth-provider.ts` — class implementing `OAuthServerProvider` interface
- [x] `clientsStore`: in-memory `Map<string, OAuthClientInformationFull>` with `getClient()` and `registerClient()`
- [x] `authorize()`: render HTML consent page with password field
- [x] `handleConsentSubmission()`: validate pre-shared password; issue short-lived (10 min) single-use authorization code bound to PKCE challenge; redirect back with `code` and `state`
- [x] `challengeForAuthorizationCode()`: return stored PKCE `code_challenge` for a given auth code
- [x] `exchangeAuthorizationCode()`: sign JWT access token with `JWT_SIGNING_SECRET`, audience-bound to server URL; generate and return refresh token; validate `resource` parameter (RFC 8707)
- [x] `exchangeRefreshToken()`: validate refresh token, rotate on each use, return new token pair
- [x] `verifyAccessToken()`: verify JWT signature, expiry, and `aud` claim; return `AuthInfo`
- [x] Write unit tests: JWT generation/verification, refresh token rejection, expired token rejection, wrong audience rejection
- [x] Verify: tests pass (6 tests)

### T13: Wire OAuth + MCP into Express server

- [x] In `src/index.ts`, install `mcpAuthRouter()` with our `OAuthServerProvider` and server URL config
- [x] Protect `/mcp` endpoint with `requireBearerAuth()` middleware
- [x] Configure `StreamableHTTPServerTransport` on `/mcp`
- [x] Add `GET /health` endpoint (unprotected)
- [x] Custom POST /authorize handler for consent form submission

### T14: Tailscale Funnel + launchd deployment

- [x] Create `launchd` plist for auto-start (loads secrets from 1Password at startup)
- [ ] Configure Tailscale Funnel to expose localhost:3000 (human step)
- [ ] Load plist: `launchctl load ~/Library/LaunchAgents/com.mood-playlist-mcp.plist` (human step)
- [ ] Verify: server restarts after crash, starts on boot (human step)

-----

## Phase 5: MusicKit Auth Page

### T15: One-time Music User Token page

- [x] Create `auth-page/index.html`
- [x] Load MusicKit JS from Apple CDN
- [x] Configure with Developer Token (passed via ?token= query param)
- [x] On button click: call `music.authorize()` to trigger Apple ID sign-in
- [x] Display the Music User Token for the user to copy

### T16: Integration test — Music User Token

- [ ] User runs auth page, signs in, gets Music User Token (human step)
- [ ] Token stored in 1Password "Eviebot" vault under `Apple Music User Token` (human step)
- [ ] Test all three tools end-to-end with real Apple Music API (human step)

-----

## Phase 6: Connect & Test

### T17: CI/CD workflows

- [x] Create `.github/workflows/ci.yml` — lint, typecheck, test on PRs and pushes to main

### T18: Connect to Claude

- [ ] In claude.ai: Settings → Connectors → Add Custom Connector (human step)
- [ ] Enter the Tailscale Funnel URL (human step)
- [ ] Complete OAuth flow (human step)
- [ ] Test from Claude iOS (human step)

-----

## Phase 7: Polish

### T19: Error handling review

- [x] All API errors return useful messages (not raw stack traces) — built into all clients
- [x] Handle missing environment variables at startup with clear error — config.ts
- [x] Unsplash failures are non-blocking — returns null gracefully
- [ ] Handle Apple Music 429 (rate limit) with retry-after (deferred — low risk per plan.md)

### T20: README

- [ ] Write README.md (deferred — user will ask when ready)

### T21: Token refresh mechanism

- [x] Developer Token: auto-regenerate before expiry (handled in apple-tokens.ts with 1-day buffer)
- [ ] Music User Token expiry monitoring (deferred — will surface as 401 errors with clear messages)
