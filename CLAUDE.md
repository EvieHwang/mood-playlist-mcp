# CLAUDE.md — mood-playlist-mcp

## Project Overview

This is a remote MCP server that enables Claude (via iOS/web) to create Apple Music playlists from mood descriptions. Claude selects ~5 seed songs, this server validates them against Apple Music’s catalog, creates the playlist, and attaches a thematic cover image. Apple Music’s Autoplay continues from there.

## Stack Override

**This project uses TypeScript, not Python.** The global CLAUDE.md defaults to Python/Flask — ignore those defaults for this repo. This project uses:

- **Language:** TypeScript 5.x (strict mode)
- **Runtime:** Node.js 20+
- **Framework:** MCP TypeScript SDK (`@modelcontextprotocol/sdk`)
- **Deployment:** Tailscale Funnel on evBot Mac Mini
- **Infrastructure:** `launchd` plist for process management
- **Package manager:** npm
- **Linting:** ESLint + Prettier
- **Testing:** Vitest

## Key Commands

```bash
npm install          # Install dependencies
npm run build        # TypeScript compile
npm run dev          # Local dev server (localhost:3000)
npm run start        # Production server
npm run test         # Run tests
npm run lint         # Lint + format check
tailscale funnel 3000  # Expose via Tailscale Funnel (run once)
```

## Architecture

```
Claude (Anthropic servers)
  ↓ OAuth 2.1 authenticated MCP calls
Tailscale Funnel (public HTTPS)
  ↓ routes to localhost:3000
evBot Mac Mini (this server: MCP resource server + co-located OAuth server)
  ↓ Developer Token + Music User Token
Apple Music API
  ↓ playlist appears in user's library
```

Two auth layers:

1. **Claude ↔ this server:** OAuth 2.1 with DCR, Authorization Code + PKCE, JWT access tokens
1. **This server ↔ Apple Music:** Developer Token (JWT) + Music User Token (stored in 1Password)

## Secrets (1Password “Eviebot” vault)

Loaded via `op read` at process startup (same pattern as Fastmail MCP server):

```bash
APPLE_TEAM_ID            # op://Eviebot/Apple MusicKit Team ID/credential
APPLE_KEY_ID             # op://Eviebot/Apple MusicKit Key ID/credential
APPLE_PRIVATE_KEY        # op://Eviebot/Apple MusicKit Private Key/credential
APPLE_MUSIC_USER_TOKEN   # op://Eviebot/Apple Music User Token/credential
UNSPLASH_ACCESS_KEY      # op://Eviebot/Unsplash Access Key/credential
OAUTH_CONSENT_PASSWORD   # op://Eviebot/Mood Playlist OAuth Consent Password/credential
JWT_SIGNING_SECRET       # op://Eviebot/Mood Playlist JWT Secret/credential
```

Never hardcode secrets. Load from environment variables populated by 1Password CLI.

## Autonomy Settings

### Do without asking

- Git operations (branch, commit, push, PR)
- npm install / build / test / lint
- Create or modify any file in this repo
- Search Apple Music catalog (read-only)
- Fetch from Unsplash API (read-only)

### Ask first

- Create playlists in Apple Music library (during testing — destructive to user’s library)
- Modify 1Password vault entries
- Change the OAuth 2.1 implementation approach

## Code Conventions

- Flat file structure preferred. Don’t over-nest directories.
- Each MCP tool in its own file under `src/tools/`.
- Shared utilities under `src/lib/`.
- Auth logic under `src/auth/`.
- Keep files under 300 lines.
- Use early returns, avoid deep nesting.
- Parameterize all external calls (no string interpolation for URLs or queries).
- Error handling: fail gracefully, return useful messages to Claude, never expose raw stack traces.
- All public functions get JSDoc comments. Internal helpers don’t need them.

## File Structure (target)

```
mood-playlist-mcp/
├── CLAUDE.md
├── README.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── specs/
│   ├── CONSTITUTION.md
│   └── 001-core-server/
│       ├── spec.md
│       ├── plan.md
│       └── tasks.md
├── src/
│   ├── index.ts               # MCP server entry point (Streamable HTTP)
│   ├── auth/
│   │   ├── oauth.ts           # OAuth 2.1 endpoints (discovery, register, authorize, token)
│   │   ├── jwt.ts             # JWT signing/validation
│   │   ├── middleware.ts      # Bearer token validation middleware
│   │   └── apple-tokens.ts    # Developer Token generation, Music User Token management
│   ├── tools/
│   │   ├── create-mood-playlist.ts
│   │   ├── search-apple-music.ts
│   │   └── list-playlists.ts
│   └── lib/
│       ├── apple-music-client.ts   # Apple Music API wrapper
│       ├── fuzzy-match.ts          # Song matching logic
│       └── unsplash.ts             # Cover image fetching
├── auth-page/
│   └── index.html             # One-time MusicKit JS auth page
├── launchd/
│   └── com.mood-playlist-mcp.plist  # macOS service definition
├── tests/
│   ├── oauth.test.ts
│   ├── jwt.test.ts
│   ├── fuzzy-match.test.ts
│   ├── apple-tokens.test.ts
│   └── tools/
│       └── create-mood-playlist.test.ts
└── .github/
    └── workflows/
        └── ci.yml
```

## Design Principles

1. **Claude is the curator, the server is the librarian.** This server does not make creative decisions. It validates, matches, and executes.
1. **Graceful fallback over failure.** Fuzzy match aggressively. Only report back to Claude when a song genuinely doesn’t exist.
1. **Songs are signal, not destination.** The 5 seed tracks tell Autoplay where to go. Every track must earn its spot.

## Spec-Driven Workflow

This project uses SpecKit. Specs live in `specs/`. Before implementing, read the spec, plan, and tasks. Follow the task sequence. Update task status as you go.