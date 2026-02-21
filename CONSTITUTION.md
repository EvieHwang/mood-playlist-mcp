# CONSTITUTION — mood-playlist-mcp

## Purpose

A remote MCP server that lets Claude create Apple Music playlists from mood descriptions. The user describes a feeling on their phone, Claude picks songs, this server makes the playlist real.

## Non-Negotiable Principles

1. **Zero friction from the phone.** The entire experience is: open Claude → describe mood → playlist appears in Apple Music. No extra apps, auth prompts, or manual steps during use.
1. **Secrets never touch the repo.** All credentials live in 1Password (“Eviebot” vault), loaded via `op read` at process startup. No .env files, no hardcoded tokens, no secrets in CI logs.
1. **Simple infrastructure.** Runs on evBot (Mac Mini) behind Tailscale Funnel. One process, one machine, `launchd` for persistence. No cloud compute, no containers.
1. **Fail gracefully.** If a song can’t be found, fuzzy-match it. If fuzzy matching fails, tell Claude so it can substitute. Never show the user “3 of 5 songs failed.”
1. **The server is dumb on purpose.** All creative decisions (mood interpretation, song selection, playlist naming) happen in Claude’s inference. This server validates against the catalog and executes.

## Technical Boundaries

- **Language:** TypeScript (MCP SDK best practice for remote servers)
- **Deployment target:** Tailscale Funnel on evBot Mac Mini
- **Region:** N/A (runs locally on evBot)
- **Auth:** OAuth 2.1 with Dynamic Client Registration (MCP spec requirement for remote servers)
- **External APIs:** Apple Music REST API, Unsplash API
- **No database.** State lives in Apple Music (playlists) and 1Password (tokens). OAuth client registrations in memory. No DynamoDB, no RDS, no SQLite.

## What This Project Is Not

- Not a music recommendation engine. Claude recommends; this server executes.
- Not a music player or streaming service.
- Not a general-purpose Apple Music client. We support playlist creation and catalog search, nothing else.
- Not a multi-user service. This serves one Apple Music account (the developer’s).

## Decision Log

|Decision                       |Rationale                                                                             |
|-------------------------------|--------------------------------------------------------------------------------------|
|TypeScript over Python         |MCP SDK best practices; better type safety for API contracts                          |
|5 seed tracks default          |Enough to triangulate mood for Autoplay; ~18-20 min before handoff                    |
|Fuzzy matching with auto-accept|Graceful handling of live versions, remasters, different albums                       |
|Unsplash for covers            |Free, high-quality, royalty-free; mood-searchable                                     |
|OAuth 2.1 + DCR                |Required by MCP spec for remote HTTP servers                                          |
|No database                    |Single-user, stateless operations; tokens in 1Password, client registrations in memory|
|evBot over Lambda              |Already running, proven with Fastmail MCP, simpler debugging, no cold starts          |