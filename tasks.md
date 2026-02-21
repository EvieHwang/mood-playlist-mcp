# Tasks: Core MCP Server

## Prerequisites (Human — before running these tasks)

- [ ] **P1:** Apple Developer Program enrolled, Team ID and Key ID noted
- [ ] **P2:** MusicKit private key (.p8) downloaded and stored in 1Password “Eviebot” vault
- [ ] **P3:** Unsplash developer account created, Access Key stored in 1Password “Eviebot” vault
- [ ] **P4:** GitHub repo `EvieHwang/mood-playlist-mcp` created with these spec files committed
- [ ] **P5:** 1Password items created in “Eviebot” vault: `Apple MusicKit Team ID`, `Apple MusicKit Key ID`, `Apple MusicKit Private Key`, `Unsplash Access Key`, `Mood Playlist OAuth Consent Password`, `Mood Playlist JWT Secret`. (Music User Token added later in T19.)
- [ ] **P6:** Tailscale Funnel enabled on evBot (if not already from Fastmail MCP setup)

-----

## Phase 1: Project Scaffolding

### T1: Initialize TypeScript project

- [ ] `npm init` with project metadata
- [ ] Install dependencies per plan.md
- [ ] Configure `tsconfig.json` (strict mode, ES2022 target, NodeNext module)
- [ ] Configure ESLint + Prettier
- [ ] Configure Vitest
- [ ] Create directory structure per CLAUDE.md file tree
- [ ] Verify: `npm run build` succeeds with empty `src/index.ts`

### T2: HTTP server scaffolding

- [ ] Set up Express (or similar) HTTP server in `src/index.ts`
- [ ] Configure to listen on `localhost:3000` (port configurable via `PORT` env var)
- [ ] Add health check endpoint: `GET /health` → `200 OK`
- [ ] Verify: `npm run dev` starts server, health check responds

### T3: Environment configuration

- [ ] Create `src/lib/config.ts` — load and validate all required environment variables at startup
- [ ] Type the config object (all expected keys)
- [ ] Fail fast with clear error if any required env var is missing
- [ ] Write unit test: verify missing vars throw, present vars load correctly
- [ ] Verify: tests pass

-----

## Phase 2: Apple Music Integration

### T4: Developer Token generation

- [ ] Implement `src/auth/apple-tokens.ts` — `generateDeveloperToken()`
- [ ] Sign JWT with ES256 using the .p8 private key from environment variable
- [ ] Cache token in memory, regenerate when within 1 day of expiry
- [ ] Write unit test: verify JWT structure, claims, and signature algorithm
- [ ] Verify: tests pass

### T5: Apple Music API client

- [ ] Implement `src/lib/apple-music-client.ts`
- [ ] Methods: `searchCatalog(query, type, limit)`, `createPlaylist(name, description, trackIds)`, `listPlaylists(limit)`, `addTracksToPlaylist(playlistId, trackIds)`
- [ ] All methods include Developer Token + Music User Token headers
- [ ] Handle 401 responses (expired token) with clear error messages
- [ ] Verify: compiles and types check (integration test deferred to T14)

### T6: Fuzzy matching

- [ ] Implement `src/lib/fuzzy-match.ts`
- [ ] Input: `{title, artist}` + Apple Music search results
- [ ] Output: `{matched_track, match_type, confidence_score}` or `not_found`
- [ ] Scoring: artist similarity (60% weight) + title similarity (40% weight)
- [ ] Thresholds: >0.7 auto-accept, <0.4 reject, between = accept with flag
- [ ] Write unit tests with cases:
  - Exact match: “Says” by Nils Frahm → finds “Says” by Nils Frahm
  - Fuzzy match: “Re: Stacks” by Bon Iver → finds “Re:Stacks” by Bon Iver
  - Album variant: “Erased Tapes” version vs “All Melody” version → accepts either
  - Not found: completely wrong artist → returns not_found
- [ ] Verify: all tests pass

-----

## Phase 3: MCP Tools

### T7: MCP server skeleton

- [ ] Implement `src/index.ts` — initialize MCP server with Streamable HTTP transport
- [ ] Register tool definitions (name, description, input schema) for all three tools
- [ ] Wire up request handler that routes tool calls to implementations
- [ ] Verify: server starts locally, tools are discoverable via MCP inspector or test client

### T8: `search_apple_music` tool

- [ ] Implement `src/tools/search-apple-music.ts`
- [ ] Input validation: query required, type defaults to “songs”, limit defaults to 5
- [ ] Call Apple Music client, format results
- [ ] Return: array of `{id, name, artist, album}`
- [ ] Verify: compiles, input validation works

### T9: `create_mood_playlist` tool

- [ ] Implement `src/tools/create-mood-playlist.ts`
- [ ] For each song: search catalog → fuzzy match → collect track IDs
- [ ] Fetch Unsplash image for mood string
- [ ] Create playlist with matched tracks
- [ ] Return structured response per spec.md R4
- [ ] Handle partial failures: if 3/5 match, create playlist with 3 and report gaps
- [ ] Verify: compiles, logic flow is correct

### T10: `list_my_playlists` tool

- [ ] Implement `src/tools/list-playlists.ts`
- [ ] Input: optional limit (default 25)
- [ ] Call Apple Music client
- [ ] Return: array of `{name, id, track_count}`
- [ ] Verify: compiles

### T11: Unsplash integration

- [ ] Implement `src/lib/unsplash.ts`
- [ ] Search for landscape photos matching mood query
- [ ] Return first result’s regular URL (1080px)
- [ ] Handle no-results gracefully (return null, don’t fail the playlist creation)
- [ ] Verify: compiles

-----

## Phase 4: OAuth 2.1 + Deployment

### T12: OAuth discovery endpoints

- [ ] Implement `src/auth/oauth.ts`
- [ ] `GET /.well-known/oauth-protected-resource` — returns Protected Resource Metadata (RFC 9728) pointing to the co-located authorization server
- [ ] `GET /.well-known/oauth-authorization-server` — returns Authorization Server Metadata (RFC 8414) with endpoints, supported grant types, PKCE requirement
- [ ] Verify: both endpoints return valid JSON; metadata URLs are consistent

### T13: Dynamic Client Registration

- [ ] `POST /register` — accepts client metadata per RFC 7591, returns `client_id` + `client_secret`
- [ ] Store registered clients in memory (single client expected — Claude)
- [ ] Verify: registration returns valid client credentials

### T14: Authorization + consent page

- [ ] `GET /authorize` — renders HTML consent page with password field
- [ ] Validate `client_id`, `redirect_uri`, `code_challenge` (PKCE S256), `state`
- [ ] `POST /authorize` — validates pre-shared password (from `OAUTH_CONSENT_PASSWORD` env var), issues authorization code
- [ ] Authorization codes are short-lived (10 minutes), single-use, bound to PKCE challenge
- [ ] Redirect back to client with `code` and `state`
- [ ] Verify: consent page renders; correct password produces redirect with code; wrong password shows error

### T15: Token endpoint

- [ ] `POST /token` — exchanges authorization code for access token
- [ ] Validate PKCE `code_verifier` against stored `code_challenge`
- [ ] Validate `resource` parameter (RFC 8707) matches this server’s URL
- [ ] Issue JWT access token signed with `JWT_SIGNING_SECRET`, audience-bound to this server
- [ ] Issue refresh token; rotate on each use (public client requirement)
- [ ] Support `grant_type=authorization_code` and `grant_type=refresh_token`
- [ ] Verify: valid code exchange returns JWT; invalid code/verifier returns error

### T16: Token validation middleware

- [ ] Middleware on `/mcp` endpoint: validate `Authorization: Bearer <token>` header
- [ ] Verify JWT signature, expiry, and audience
- [ ] Return `401 Unauthorized` with `WWW-Authenticate` header if invalid/missing
- [ ] Write unit tests: valid token passes, expired token rejected, wrong audience rejected, missing token returns 401 with proper header
- [ ] Verify: tests pass

### T17: Streamable HTTP transport + Tailscale Funnel

- [ ] Configure MCP server with Streamable HTTP transport
- [ ] Server listens on `localhost:3000` (configurable via env)
- [ ] Wire OAuth endpoints and MCP endpoint into same HTTP server
- [ ] Configure Tailscale Funnel to expose localhost:3000
- [ ] Test: public URL reaches both discovery endpoints and MCP endpoint
- [ ] Create `launchd` plist for auto-start (same pattern as Fastmail MCP server)
- [ ] Load plist: `launchctl load ~/Library/LaunchAgents/com.mood-playlist-mcp.plist`
- [ ] Verify: server restarts after crash, starts on boot

-----

## Phase 5: MusicKit Auth Page

### T18: One-time Music User Token page

- [ ] Create `auth-page/index.html`
- [ ] Load MusicKit JS from Apple CDN
- [ ] Configure with Developer Token
- [ ] On button click: call `music.authorize()` to trigger Apple ID sign-in
- [ ] Display the Music User Token for the user to copy
- [ ] Verify: page loads, MusicKit JS initializes (full test requires Developer Token)

### T19: Integration test — Music User Token

- [ ] User runs auth page, signs in, gets Music User Token
- [ ] Token stored in 1Password “Eviebot” vault under `Apple Music User Token`
- [ ] Add to environment: `export APPLE_MUSIC_USER_TOKEN=$(op read "op://Eviebot/Apple Music User Token/credential")`
- [ ] Restart the server process
- [ ] Test: `search_apple_music` tool returns results for “Nils Frahm Says” (via authenticated MCP request)
- [ ] Test: `create_mood_playlist` creates a test playlist with 2-3 tracks
- [ ] Test: `list_my_playlists` shows the test playlist
- [ ] Clean up: delete test playlist manually
- [ ] Verify: all three tools work end-to-end with real Apple Music API

-----

## Phase 6: Connect & Test

### T20: CI/CD workflows

- [ ] Create `.github/workflows/ci.yml` — lint, typecheck, test on PRs
- [ ] Verify: CI passes on a test PR

### T21: Connect to Claude

- [ ] In claude.ai: Settings → Connectors → Add Custom Connector
- [ ] Enter the Tailscale Funnel URL
- [ ] Complete OAuth flow (approve the connection on the consent page)
- [ ] Verify: tools appear in Claude’s tool list
- [ ] Test from Claude iOS: describe a mood, verify playlist creation
- [ ] Verify: end-to-end flow works from phone

-----

## Phase 7: Polish

### T22: Error handling review

- [ ] Ensure all API errors return useful messages (not raw stack traces)
- [ ] Handle Apple Music 429 (rate limit) with retry-after
- [ ] Handle missing environment variables at startup with clear error
- [ ] Handle network timeouts gracefully
- [ ] Handle OAuth errors with clear messages (invalid code, expired token, bad redirect_uri)

### T23: README

- [ ] Write README.md with: project purpose, setup instructions, deployment guide, architecture diagram
- [ ] Include prerequisites checklist
- [ ] Include the benchmark test case from spec.md

### T24: Token refresh mechanism

- [ ] Monitor Music User Token expiry
- [ ] If token expires: log clear error message, return helpful error to Claude (“Music User Token expired — re-run auth page”)
- [ ] Developer Token: auto-regenerate before expiry (already handled in T4)