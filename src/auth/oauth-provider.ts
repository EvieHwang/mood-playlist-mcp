/**
 * OAuth 2.1 server provider implementing the MCP SDK's OAuthServerProvider interface.
 * Single-user consent with pre-shared password, JWT access tokens, refresh token rotation.
 */

import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Response } from "express";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

interface AuthCode {
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  resource?: string;
  scopes?: string[];
  expiresAt: number;
}

export interface OAuthProviderConfig {
  consentPassword: string;
  jwtSecret: string;
  serverUrl: string;
}

class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return this.clients.get(clientId);
  }

  async registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">,
  ): Promise<OAuthClientInformationFull> {
    const full = client as OAuthClientInformationFull;
    this.clients.set(full.client_id, full);
    return full;
  }
}

export class MoodPlaylistOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore;
  private authCodes = new Map<string, AuthCode>();
  private refreshTokens = new Map<string, { clientId: string; scopes?: string[] }>();
  private config: OAuthProviderConfig;

  constructor(config: OAuthProviderConfig) {
    this.config = config;
    this.clientsStore = new InMemoryClientsStore();
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    // Render a consent page with password field
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mood Playlist MCP — Authorize</title>
  <link rel="stylesheet" href="https://cdn.simplecss.org/simple.css">
</head>
<body>
  <main>
    <h1>Mood Playlist MCP</h1>
    <p>An application wants to connect to your Mood Playlist server.</p>
    <p><strong>Client:</strong> ${escapeHtml(client.client_name || client.client_id)}</p>
    <form method="POST" action="/consent">
      <input type="hidden" name="client_id" value="${escapeHtml(client.client_id)}">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}">
      <input type="hidden" name="state" value="${escapeHtml(params.state || "")}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(params.codeChallenge)}">
      <input type="hidden" name="code_challenge_method" value="S256">
      <input type="hidden" name="scope" value="${escapeHtml(params.scopes?.join(" ") || "")}">
      <input type="hidden" name="resource" value="${escapeHtml(params.resource?.toString() || "")}">
      <label for="password">Enter the consent password:</label>
      <input type="password" id="password" name="password" required autofocus>
      <button type="submit">Authorize</button>
    </form>
  </main>
</body>
</html>`;

    res.type("html").send(html);
  }

  async handleConsentSubmission(body: Record<string, string>, res: Response): Promise<void> {
    const {
      client_id,
      redirect_uri,
      state,
      code_challenge,
      code_challenge_method,
      scope,
      resource,
      password,
    } = body;

    if (password !== this.config.consentPassword) {
      res.status(403).type("html").send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Access Denied</title>
<link rel="stylesheet" href="https://cdn.simplecss.org/simple.css">
</head><body><main><h1>Access Denied</h1><p>Incorrect password. <a href="javascript:history.back()">Try again</a>.</p></main></body></html>`);
      return;
    }

    const code = randomUUID();
    this.authCodes.set(code, {
      clientId: client_id,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method || "S256",
      redirectUri: redirect_uri,
      resource: resource || undefined,
      scopes: scope ? scope.split(" ") : undefined,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (state) redirectUrl.searchParams.set("state", state);

    res.redirect(302, redirectUrl.toString());
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const entry = this.authCodes.get(authorizationCode);
    if (!entry) throw new Error("Unknown authorization code");
    return entry.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const entry = this.authCodes.get(authorizationCode);
    if (!entry) throw new Error("Unknown authorization code");
    if (entry.clientId !== client.client_id) throw new Error("Client mismatch");
    if (entry.expiresAt < Date.now()) {
      this.authCodes.delete(authorizationCode);
      throw new Error("Authorization code expired");
    }

    // Validate resource indicator
    if (resource && entry.resource && resource.toString() !== entry.resource) {
      throw new Error("Resource mismatch");
    }

    // Consume the code (single-use)
    this.authCodes.delete(authorizationCode);

    return this.issueTokens(client.client_id, entry.scopes);
  }

  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    _resource?: URL,
  ): Promise<OAuthTokens> {
    const entry = this.refreshTokens.get(refreshToken);
    if (!entry) throw new Error("Invalid refresh token");

    // Rotate: delete old, issue new
    this.refreshTokens.delete(refreshToken);

    return this.issueTokens(entry.clientId, scopes ?? entry.scopes);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    try {
      const payload = jwt.verify(token, this.config.jwtSecret, {
        audience: this.config.serverUrl,
      }) as jwt.JwtPayload;

      return {
        token,
        clientId: payload.sub ?? "unknown",
        scopes: payload.scopes ?? [],
        expiresAt: payload.exp ? payload.exp * 1000 : undefined,
      };
    } catch {
      throw new Error("Invalid or expired access token");
    }
  }

  private issueTokens(clientId: string, scopes?: string[]): OAuthTokens {
    const accessToken = jwt.sign({ sub: clientId, scopes: scopes ?? [] }, this.config.jwtSecret, {
      algorithm: "HS256",
      expiresIn: "1h",
      audience: this.config.serverUrl,
    });

    const refreshToken = randomUUID();
    this.refreshTokens.set(refreshToken, { clientId, scopes });

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: refreshToken,
    };
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
