import type pg from "pg";
import { hashToken } from "../src/lib/mcp-tokens";

export interface TokenInfo {
  id: string;
  name: string;
}

export function bearerFrom(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m?.[1];
}

/** Returns the token record if the bearer token is valid and not revoked. */
export async function verifyToken(pool: pg.Pool, token: string | undefined): Promise<TokenInfo | undefined> {
  if (!token) return undefined;
  const { rows } = await pool.query<{ id: string; name: string; revoked_at: Date | null }>(
    "SELECT id, name, revoked_at FROM mcp_tokens WHERE token_hash = $1",
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row || row.revoked_at) return undefined;
  await pool.query("UPDATE mcp_tokens SET last_used_at = now() WHERE id = $1", [row.id]);
  return { id: row.id, name: row.name };
}
