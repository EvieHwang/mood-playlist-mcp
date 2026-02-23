# mood-playlist-mcp

A remote MCP server that lets Claude create Apple Music playlists from mood descriptions. You describe a vibe, Claude picks songs, and they show up in your Apple Music library with a thematic cover image. Apple Music's Autoplay continues from there.

## How it works

```
Claude (iOS/web)
  | OAuth 2.1 authenticated MCP calls
Tailscale Funnel (public HTTPS)
  | routes to localhost:3000
Mac Mini (this server)
  | Developer Token + Music User Token
Apple Music API
  | playlist appears in your library
```

Claude has access to three tools:

- **search_apple_music** — search the Apple Music catalog for songs, albums, or artists
- **create_mood_playlist** — create a playlist from a mood description and song picks, with an Unsplash cover image
- **list_my_playlists** — list playlists in your Apple Music library

## Prerequisites

- Node.js 20+
- Apple Developer account with a MusicKit key (.p8)
- Apple Music subscription (for the Music User Token)
- [Tailscale Funnel](https://tailscale.com/kb/1223/funnel) for public HTTPS
- [1Password CLI](https://developer.1password.com/docs/cli/) with a service account for secrets

## Secrets

All secrets are loaded from 1Password at startup via `op read`. See `scripts/start.sh` for the full list:

| Secret | 1Password item |
|---|---|
| `APPLE_TEAM_ID` | Apple MusicKit Team ID |
| `APPLE_KEY_ID` | Apple MusicKit Key ID |
| `APPLE_PRIVATE_KEY` | Apple MusicKit Private Key |
| `APPLE_MUSIC_USER_TOKEN` | Apple Music User Token |
| `UNSPLASH_ACCESS_KEY` | Unsplash Access Key |
| `OAUTH_CONSENT_PASSWORD` | Mood Playlist OAuth Consent Password |
| `JWT_SIGNING_SECRET` | Mood Playlist JWT Secret |

## Setup

```bash
npm install
npm run build
```

### One-time: obtain a Music User Token

The server includes a MusicKit JS auth page for obtaining a Music User Token:

1. Generate a developer token: `npx tsx scripts/generate-dev-token.ts`
2. Start the server: `npm run dev`
3. Open `http://localhost:3000/auth-page/index.html?token=<developer-token>` in a browser
4. Click "Authorize" and approve the Apple Music permission
5. Copy the token and save it to 1Password as "Apple Music User Token"

### Run the server

```bash
# Development
npm run dev

# Production (loads secrets from 1Password)
./scripts/start.sh
```

### Expose via Tailscale Funnel

```bash
tailscale funnel 3000
```

### Connect Claude

Add the server URL (e.g. `https://yourhost.ts.net`) as a remote MCP server in Claude's settings. The first connection triggers an OAuth consent flow — enter the consent password to authorize.

## Development

```bash
npm run test         # Run tests
npm run lint         # Lint + format check
npm run lint:fix     # Auto-fix lint issues
npm run typecheck    # Type check without emitting
```

## Auth design

Two independent auth layers:

1. **Claude to this server** — OAuth 2.1 with Dynamic Client Registration, Authorization Code + PKCE, JWT access tokens. Single-user consent with a pre-shared password.
2. **This server to Apple Music** — Developer Token (ES256 JWT signed with .p8 key) + Music User Token (obtained once via MusicKit JS, stored in 1Password).

## License

MIT
