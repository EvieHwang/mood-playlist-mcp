/**
 * Apple Developer Token generation — signs a JWT with ES256 using the .p8 private key.
 * Caches the token in memory and regenerates when within 1 day of expiry.
 */

import jwt from "jsonwebtoken";

const MAX_TOKEN_AGE_SECONDS = 15777000; // ~6 months
const REGENERATION_BUFFER_MS = 24 * 60 * 60 * 1000; // 1 day

let cachedToken: string | null = null;
let cachedExpiry: number = 0;

export interface AppleTokenConfig {
  teamId: string;
  keyId: string;
  privateKey: string;
}

/** Normalize a PEM key that may have spaces instead of newlines (1Password format). */
function normalizePem(key: string): string {
  const match = key.match(/-----BEGIN PRIVATE KEY-----(.+)-----END PRIVATE KEY-----/s);
  if (!match) return key;
  const base64 = match[1].replace(/\s+/g, "");
  const lines = base64.match(/.{1,64}/g) || [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`;
}

/** Generate an Apple Music Developer Token (JWT signed with ES256). */
export function generateDeveloperToken(config: AppleTokenConfig): string {
  const now = Date.now();

  if (cachedToken && now < cachedExpiry - REGENERATION_BUFFER_MS) {
    return cachedToken;
  }

  const pemKey = normalizePem(config.privateKey);
  const nowSeconds = Math.floor(now / 1000);
  const token = jwt.sign({}, pemKey, {
    algorithm: "ES256",
    expiresIn: MAX_TOKEN_AGE_SECONDS,
    issuer: config.teamId,
    header: {
      alg: "ES256",
      kid: config.keyId,
    },
  });

  cachedToken = token;
  cachedExpiry = (nowSeconds + MAX_TOKEN_AGE_SECONDS) * 1000;

  return token;
}

/** Clear the cached token (useful for testing). */
export function clearTokenCache(): void {
  cachedToken = null;
  cachedExpiry = 0;
}
