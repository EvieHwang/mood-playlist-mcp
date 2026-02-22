import { describe, it, expect, afterEach } from "vitest";
import { generateDeveloperToken, clearTokenCache } from "../src/auth/apple-tokens.js";
import jwt from "jsonwebtoken";
import { generateKeyPairSync } from "node:crypto";

// Generate a test ES256 key pair
const { privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});
const pemKey = privateKey.export({ type: "pkcs8", format: "pem" }) as string;

const TEST_CONFIG = {
  teamId: "TESTTEAM123",
  keyId: "TESTKEY456",
  privateKey: pemKey,
};

describe("generateDeveloperToken", () => {
  afterEach(() => {
    clearTokenCache();
  });

  it("returns a valid JWT signed with ES256", () => {
    const token = generateDeveloperToken(TEST_CONFIG);
    const decoded = jwt.decode(token, { complete: true });

    expect(decoded).not.toBeNull();
    expect(decoded!.header.alg).toBe("ES256");
    expect(decoded!.header.kid).toBe("TESTKEY456");
    expect(decoded!.payload.iss).toBe("TESTTEAM123");
  });

  it("sets expiry to ~6 months", () => {
    const token = generateDeveloperToken(TEST_CONFIG);
    const decoded = jwt.decode(token) as jwt.JwtPayload;

    const expectedExpiry = Math.floor(Date.now() / 1000) + 15777000;
    expect(decoded.exp).toBeGreaterThan(expectedExpiry - 10);
    expect(decoded.exp).toBeLessThan(expectedExpiry + 10);
  });

  it("returns cached token on second call", () => {
    const token1 = generateDeveloperToken(TEST_CONFIG);
    const token2 = generateDeveloperToken(TEST_CONFIG);
    expect(token1).toBe(token2);
  });

  it("returns fresh token after cache clear", () => {
    const token1 = generateDeveloperToken(TEST_CONFIG);
    clearTokenCache();
    const token2 = generateDeveloperToken(TEST_CONFIG);
    expect(token1).not.toBe(token2);
  });
});
