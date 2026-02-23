#!/usr/bin/env bash
# Start the mood-playlist-mcp server with secrets from 1Password.
# Called by launchd — assumes OP_SERVICE_ACCOUNT_TOKEN is in the environment.

set -euo pipefail

export PATH="/opt/homebrew/bin:$PATH"

export APPLE_TEAM_ID=$(op read "op://Eviebot/Apple MusicKit Team ID/credential")
export APPLE_KEY_ID=$(op read "op://Eviebot/Apple MusicKit Key ID/credential")
export APPLE_PRIVATE_KEY=$(op read "op://Eviebot/Apple MusicKit Private Key/credential")
export APPLE_MUSIC_USER_TOKEN=$(op read "op://Eviebot/Apple Music User Token/credential" 2>/dev/null || echo "")
export OAUTH_CONSENT_PASSWORD=$(op read "op://Eviebot/Mood Playlist OAuth Consent Password/credential")
export JWT_SIGNING_SECRET=$(op read "op://Eviebot/Mood Playlist JWT Secret/credential")
export SERVER_URL="https://eviebot.tailf90db7.ts.net"
export PORT=3000

exec /opt/homebrew/bin/node /Users/evehwang/projects/mood-playlist-mcp/dist/index.js
