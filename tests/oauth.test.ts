import { describe, it, expect, beforeEach } from "vitest";
import { MoodPlaylistOAuthProvider } from "../src/auth/oauth-provider.js";
import jwt from "jsonwebtoken";

const TEST_CONFIG = {
  consentPassword: "test-password-123",
  jwtSecret: "test-jwt-secret-abc",
  serverUrl: "https://test.example.com",
};

describe("MoodPlaylistOAuthProvider", () => {
  let provider: MoodPlaylistOAuthProvider;

  beforeEach(() => {
    provider = new MoodPlaylistOAuthProvider(TEST_CONFIG);
  });

  describe("verifyAccessToken", () => {
    it("validates a properly signed JWT", async () => {
      const token = jwt.sign({ sub: "client-1", scopes: ["mcp:tools"] }, TEST_CONFIG.jwtSecret, {
        algorithm: "HS256",
        expiresIn: "1h",
        audience: TEST_CONFIG.serverUrl,
      });

      const info = await provider.verifyAccessToken(token);
      expect(info.clientId).toBe("client-1");
      expect(info.scopes).toContain("mcp:tools");
      expect(info.token).toBe(token);
    });

    it("rejects expired tokens", async () => {
      const token = jwt.sign({ sub: "client-1" }, TEST_CONFIG.jwtSecret, {
        algorithm: "HS256",
        expiresIn: "-1h",
        audience: TEST_CONFIG.serverUrl,
      });

      await expect(provider.verifyAccessToken(token)).rejects.toThrow(
        "Invalid or expired access token",
      );
    });

    it("rejects tokens with wrong audience", async () => {
      const token = jwt.sign({ sub: "client-1" }, TEST_CONFIG.jwtSecret, {
        algorithm: "HS256",
        expiresIn: "1h",
        audience: "https://wrong-server.example.com",
      });

      await expect(provider.verifyAccessToken(token)).rejects.toThrow(
        "Invalid or expired access token",
      );
    });

    it("rejects tokens with wrong secret", async () => {
      const token = jwt.sign({ sub: "client-1" }, "wrong-secret", {
        algorithm: "HS256",
        expiresIn: "1h",
        audience: TEST_CONFIG.serverUrl,
      });

      await expect(provider.verifyAccessToken(token)).rejects.toThrow(
        "Invalid or expired access token",
      );
    });
  });

  describe("exchangeRefreshToken", () => {
    it("rejects invalid refresh tokens", async () => {
      const fakeClient = { client_id: "test" } as Parameters<
        typeof provider.exchangeRefreshToken
      >[0];
      await expect(provider.exchangeRefreshToken(fakeClient, "fake-refresh-token")).rejects.toThrow(
        "Invalid refresh token",
      );
    });
  });

  describe("challengeForAuthorizationCode", () => {
    it("rejects unknown authorization codes", async () => {
      const fakeClient = { client_id: "test" } as Parameters<
        typeof provider.challengeForAuthorizationCode
      >[0];
      await expect(provider.challengeForAuthorizationCode(fakeClient, "fake-code")).rejects.toThrow(
        "Unknown authorization code",
      );
    });
  });
});
