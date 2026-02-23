/**
 * MCP server entry point — Streamable HTTP transport with OAuth 2.1 authentication.
 * Wires Express, MCP SDK, OAuth provider, and tool handlers together.
 */

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
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

if (!config.appleMusicUserToken) {
  console.warn(
    "WARNING: APPLE_MUSIC_USER_TOKEN not set. Server will start but Apple Music tools will fail.",
  );
  console.warn("Run the auth page to obtain a Music User Token and store it in 1Password.");
}

// Apple Music configuration (developer token + user token)
function getAppleMusicConfig(): AppleMusicConfig {
  if (!config.appleMusicUserToken) {
    throw new Error(
      "Music User Token not configured. Run the auth page (auth-page/index.html) to obtain one, then store it in 1Password and restart the server.",
    );
  }
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

// Express app
const app = express();

// Trust proxy (Tailscale Funnel sends X-Forwarded-For)
app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check (unprotected)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "mood-playlist-mcp" });
});

// Serve MusicKit auth page (unprotected, one-time setup)
import { fileURLToPath } from "node:url";
import path from "node:path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use("/auth-page", express.static(path.join(__dirname, "..", "auth-page")));

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

// Consent form submission (separate from /authorize to avoid SDK route conflict)
app.post("/consent", (req, res) => {
  oauthProvider.handleConsentSubmission(req.body, res).catch((err) => {
    console.error("Consent submission error:", err);
    res.status(500).send("Internal error");
  });
});

// MCP endpoint (protected with Bearer auth)
const authMiddleware = requireBearerAuth({ verifier: oauthProvider });

// Session management for Streamable HTTP
const transports = new Map<string, StreamableHTTPServerTransport>();

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "mood-playlist-mcp",
    version: "1.0.0",
  });

  server.tool(
    "search_apple_music",
    "Search the Apple Music catalog for songs, albums, or artists",
    {
      query: z.string().describe("Search terms"),
      type: z.enum(["songs", "albums", "artists"]).default("songs").describe("Type of result"),
      limit: z.number().min(1).max(25).default(5).describe("Number of results"),
    },
    async (params) => {
      try {
        const result = await handleSearchAppleMusic(params, getAppleMusicConfig());
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        console.error("search_apple_music error:", err);
        return {
          content: [
            { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "create_mood_playlist",
    "Create an Apple Music playlist from a mood description and song picks",
    {
      mood: z.string().describe("Mood or vibe description for the playlist"),
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
      try {
        const result = await handleCreateMoodPlaylist(params, getAppleMusicConfig());
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        console.error("create_mood_playlist error:", err);
        return {
          content: [
            { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "list_my_playlists",
    "List playlists in your Apple Music library",
    {
      limit: z.number().min(1).max(100).default(25).describe("Number of playlists to return"),
    },
    async (params) => {
      try {
        const result = await handleListPlaylists(params, getAppleMusicConfig());
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        console.error("list_my_playlists error:", err);
        return {
          content: [
            { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}

// MCP request handler (shared by / and /mcp routes)
async function handleMcpPost(req: express.Request, res: express.Response): Promise<void> {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId)!;
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (sid) => {
          transports.set(sid, transport);
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) transports.delete(sid);
      };

      const server = createMcpServer();
      await server.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad request: no session ID or not an initialize request" },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

async function handleMcpGet(req: express.Request, res: express.Response): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }
  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res, req.body);
}

async function handleMcpDelete(req: express.Request, res: express.Response): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res, req.body);
  } else {
    res.status(400).json({ error: "Invalid or missing session ID" });
  }
}

// Mount MCP handlers on both /mcp and / (Claude posts to root after OAuth)
app.post("/mcp", authMiddleware, handleMcpPost);
app.get("/mcp", authMiddleware, handleMcpGet);
app.delete("/mcp", authMiddleware, handleMcpDelete);
app.post("/", authMiddleware, handleMcpPost);
app.get("/", authMiddleware, handleMcpGet);
app.delete("/", authMiddleware, handleMcpDelete);

// Start server
app.listen(config.port, () => {
  console.log(`Mood Playlist MCP server listening on port ${config.port}`);
  console.log(`Server URL: ${config.serverUrl}`);
  console.log(`Health check: ${config.serverUrl}/health`);
});
