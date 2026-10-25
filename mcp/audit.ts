import type pg from "pg";

export interface AuditEntry {
  tokenId?: string | null;
  tokenName?: string | null;
  method: string;
  tool?: string | null;
  input?: unknown;
  status: "ok" | "blocked" | "error" | "unauthorized";
  reason?: string | null;
  rowCount?: number | null;
  durationMs?: number | null;
  clientIp?: string | null;
}

/** Writes one audit row. Uses the mcp_auditor role, which can only INSERT here. */
export async function writeAudit(pool: pg.Pool, e: AuditEntry): Promise<void> {
  await pool.query(
    `INSERT INTO mcp_audit (token_id, token_name, method, tool, input, status, reason, row_count, duration_ms, client_ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      e.tokenId ?? null,
      e.tokenName ?? null,
      e.method,
      e.tool ?? null,
      e.input === undefined ? null : JSON.stringify(e.input),
      e.status,
      e.reason ? e.reason.slice(0, 1000) : null,
      e.rowCount ?? null,
      e.durationMs ?? null,
      e.clientIp ?? null,
    ],
  );
}
