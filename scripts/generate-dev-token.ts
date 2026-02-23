/**
 * Generate an Apple Developer Token for use with the MusicKit auth page.
 * Usage: npx tsx scripts/generate-dev-token.ts
 */

import { execSync } from "node:child_process";
import jwt from "jsonwebtoken";

function opRead(ref: string): string {
  return execSync(`op read "${ref}"`, { encoding: "utf-8" }).trim();
}

const teamId = opRead("op://Eviebot/Apple MusicKit Team ID/credential");
const keyId = opRead("op://Eviebot/Apple MusicKit Key ID/credential");
const rawKey = opRead("op://Eviebot/Apple MusicKit Private Key/credential");

// The key is stored as a single line with spaces instead of newlines.
// Extract the base64 body, remove spaces, re-chunk into 64-char lines.
const match = rawKey.match(/-----BEGIN PRIVATE KEY-----(.+)-----END PRIVATE KEY-----/);
if (!match) throw new Error("Could not parse private key PEM format");
const base64 = match[1].replace(/\s+/g, "");
const lines = base64.match(/.{1,64}/g) || [];
const pemKey = `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`;

const token = jwt.sign({}, pemKey, {
  algorithm: "ES256",
  expiresIn: 15777000,
  issuer: teamId,
  header: { alg: "ES256", kid: keyId },
});

console.log("\nDeveloper Token:\n");
console.log(token);
console.log("\nOpen the auth page with this URL:\n");
console.log(`file:///Users/evehwang/projects/mood-playlist-mcp/auth-page/index.html?token=${token}`);
