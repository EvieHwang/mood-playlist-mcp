/**
 * MCP server entry point — Streamable HTTP transport with OAuth 2.1 authentication.
 * Wires Express, MCP SDK, OAuth provider, and tool handlers together.
 */

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { z } from "zod";

import { loadConfig } from "./lib/config.js";
import { generateDeveloperToken } from "./auth/apple-tokens.js";
import { MoodPlaylistOAuthProvider } from "./auth/oauth-provider.js";
import { handleSearchAppleMusic } from "./tools/search-apple-music.js";
import { handleCreateMoodPlaylist } from "./tools/create-mood-playlist.js";
import { handleListPlaylists } from "./tools/list-playlists.js";
import type { AppleMusicConfig } from "./lib/apple-music-client.js";

const config = loadConfig();

// Apple Music configuration (developer token + user token)
function getAppleMusicConfig(): AppleMusicConfig {
  return {
    developerToken: generateDeveloperToken({
      teamId: config.appleTeamId,
      keyId: config.appleKeyId,
      privateKey: config.applePrivateKey,
    }),
    musicUserToken: config.appleMusicUserToken,
  };
}

// OAuth provider
const oauthProvider = new MoodPlaylistOAuthProvider({
  consentPassword: config.oauthConsentPassword,
  jwtSecret: config.jwtSigningSecret,
  serverUrl: config.serverUrl,
});

// MCP Server
const mcpServer = new McpServer({
  name: "mood-playlist-mcp",
  version: "1.0.0",
});

// Register tools
mcpServer.tool(
  "search_apple_music",
  "Search the Apple Music catalog for songs, albums, or artists",
  {
    query: z.string().describe("Search terms"),
    type: z.enum(["songs", "albums", "artists"]).default("songs").describe("Type of result"),
    limit: z.number().min(1).max(25).default(5).describe("Number of results"),
  },
  async (params) => {
    const result = await handleSearchAppleMusic(params, getAppleMusicConfig());
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

mcpServer.tool(
  "create_mood_playlist",
  "Create an Apple Music playlist from a mood description and song picks",
  {
    mood: z.string().describe("Mood description for cover image and playlist description"),
    songs: z
      .array(
        z.object({
          title: z.string().describe("Song title"),
          artist: z.string().describe("Artist name"),
        }),
      )
      .min(1)
      .max(10)
      .describe("Songs to add (typically 5)"),
    playlist_name: z.string().describe("Evocative playlist name"),
  },
  async (params) => {
    const result = await handleCreateMoodPlaylist(
      params,
      getAppleMusicConfig(),
      config.unsplashAccessKey,
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

mcpServer.tool(
  "list_my_playlists",
  "List playlists in your Apple Music library",
  {
    limit: z.number().min(1).max(100).default(25).describe("Number of playlists to return"),
  },
  async (params) => {
    const result = await handleListPlaylists(params, getAppleMusicConfig());
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

// Express app
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check (unprotected)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "mood-playlist-mcp" });
});

// OAuth routes (auto-registers discovery, registration, authorize GET, token endpoints)
const serverUrl = new URL(config.serverUrl);
app.use(
  mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl: serverUrl,
    scopesSupported: ["mcp:tools"],
    resourceName: "Mood Playlist MCP",
    resourceServerUrl: serverUrl,
  }),
);

// Custom POST /authorize handler for consent form submission
app.post("/authorize", (req, res) => {
  oauthProvider.handleConsentSubmission(req.body, res).catch((err) => {
    console.error("Consent submission error:", err);
    res.status(500).send("Internal error");
  });
});

// MCP endpoint (protected with Bearer auth)
const authMiddleware = requireBearerAuth({ verifier: oauthProvider });

// Session management for Streamable HTTP
const transports = new Map<string, StreamableHTTPServerTransport>();

app.post("/mcp", authMiddleware, async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId)!;
    } else {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomSessionId(),
      });
      await mcpServer.connect(transport);
      // Store after connection so we have the session ID
      transport.sessionId && transports.set(transport.sessionId, transport);
    }

    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

app.get("/mcp", authMiddleware, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }
  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
});

app.delete("/mcp", authMiddleware, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
    transports.delete(sessionId);
  } else {
    res.status(400).json({ error: "Invalid or missing session ID" });
  }
});

function randomSessionId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Start server
app.listen(config.port, () => {
  console.log(`Mood Playlist MCP server listening on port ${config.port}`);
  console.log(`Server URL: ${config.serverUrl}`);
  console.log(`Health check: ${config.serverUrl}/health`);
});
