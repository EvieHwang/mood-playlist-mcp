/**
 * Environment configuration — loads and validates all required env vars at startup.
 * Fails fast with a clear error if any required var is missing.
 */

export interface Config {
  port: number;
  serverUrl: string;
  appleTeamId: string;
  appleKeyId: string;
  applePrivateKey: string;
  appleMusicUserToken: string;
  oauthConsentPassword: string;
  jwtSigningSecret: string;
}

const REQUIRED_VARS = [
  "APPLE_TEAM_ID",
  "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY",
  "OAUTH_CONSENT_PASSWORD",
  "JWT_SIGNING_SECRET",
] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables:\n  ${missing.join("\n  ")}`);
  }

  return {
    port: parseInt(process.env.PORT || "3000", 10),
    serverUrl: process.env.SERVER_URL || "http://localhost:3000",
    appleTeamId: requireEnv("APPLE_TEAM_ID"),
    appleKeyId: requireEnv("APPLE_KEY_ID"),
    applePrivateKey: requireEnv("APPLE_PRIVATE_KEY"),
    appleMusicUserToken: process.env.APPLE_MUSIC_USER_TOKEN || "",
    oauthConsentPassword: requireEnv("OAUTH_CONSENT_PASSWORD"),
    jwtSigningSecret: requireEnv("JWT_SIGNING_SECRET"),
  };
}
