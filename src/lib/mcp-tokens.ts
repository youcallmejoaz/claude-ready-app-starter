import { createHash, randomBytes } from "node:crypto";

// Connector tokens are random 32-byte values. Only the SHA-256 hash is stored.
// (A slow hash is not needed: the token is high entropy, not a human password.)

export function generateToken(): string {
  return `mcp_${randomBytes(32).toString("base64url")}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
