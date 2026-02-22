import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/lib/config.js";

const REQUIRED_VARS = {
  APPLE_TEAM_ID: "TEAM123",
  APPLE_KEY_ID: "KEY123",
  APPLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
  APPLE_MUSIC_USER_TOKEN: "fake-user-token",
  UNSPLASH_ACCESS_KEY: "fake-unsplash-key",
  OAUTH_CONSENT_PASSWORD: "test-password",
  JWT_SIGNING_SECRET: "test-jwt-secret",
};

describe("loadConfig", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("loads all required vars when present", () => {
    Object.assign(process.env, REQUIRED_VARS);
    const config = loadConfig();
    expect(config.appleTeamId).toBe("TEAM123");
    expect(config.appleKeyId).toBe("KEY123");
    expect(config.port).toBe(3000);
  });

  it("respects PORT env var", () => {
    Object.assign(process.env, REQUIRED_VARS, { PORT: "8080" });
    const config = loadConfig();
    expect(config.port).toBe(8080);
  });

  it("throws when required vars are missing", () => {
    delete process.env.APPLE_TEAM_ID;
    delete process.env.APPLE_KEY_ID;
    expect(() => loadConfig()).toThrow("Missing required environment variables");
  });

  it("lists all missing vars in error", () => {
    // Clear all required vars
    for (const key of Object.keys(REQUIRED_VARS)) {
      delete process.env[key];
    }
    try {
      loadConfig();
      expect.fail("Should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("APPLE_TEAM_ID");
      expect(message).toContain("JWT_SIGNING_SECRET");
    }
  });
});
