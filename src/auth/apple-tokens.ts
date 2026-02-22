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

/** Generate an Apple Music Developer Token (JWT signed with ES256). */
export function generateDeveloperToken(config: AppleTokenConfig): string {
  const now = Date.now();

  if (cachedToken && now < cachedExpiry - REGENERATION_BUFFER_MS) {
    return cachedToken;
  }

  const nowSeconds = Math.floor(now / 1000);
  const token = jwt.sign({}, config.privateKey, {
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
