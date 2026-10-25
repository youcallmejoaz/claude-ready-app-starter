import type pg from "pg";

// Creates or updates the two MCP database roles and their grants.
// Runs after migrations (scripts/migrate.ts). Passwords come from env, never from git.
//
//   mcp_readonly  SELECT on the analytics tables only. Read-only transactions, 5 s timeout.
//   mcp_auditor   Can check tokens and write audit rows. Nothing else.

export const READONLY_TABLES = [
  "ads_campaigns",
  "ads_daily_metrics",
  "ga4_daily_metrics",
  "ga4_landing_pages_daily",
  "sync_runs",
];

function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unsafe identifier: ${name}`);
  return `"${name}"`;
}

function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function upsertRole(client: pg.PoolClient | pg.Client, role: string, password: string) {
  const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
  const verb = exists.rowCount ? "ALTER" : "CREATE";
  await client.query(
    `${verb} ROLE ${ident(role)} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD ${literal(password)}`,
  );
}

export async function setupMcpRoles(
  client: pg.PoolClient | pg.Client,
  opts: { database: string; readonlyPassword: string; auditPassword: string },
) {
  const db = ident(opts.database);
  await upsertRole(client, "mcp_readonly", opts.readonlyPassword);
  await upsertRole(client, "mcp_auditor", opts.auditPassword);

  for (const role of ["mcp_readonly", "mcp_auditor"]) {
    const r = ident(role);
    await client.query(`GRANT CONNECT ON DATABASE ${db} TO ${r}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${r}`);
    await client.query(`REVOKE CREATE ON SCHEMA public FROM ${r}`);
    // Start from nothing, then grant exactly what is needed.
    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${r}`);
    await client.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${r}`);
  }

  for (const t of READONLY_TABLES) {
    await client.query(`GRANT SELECT ON ${ident(t)} TO mcp_readonly`);
  }
  await client.query(`ALTER ROLE mcp_readonly SET default_transaction_read_only = on`);
  await client.query(`ALTER ROLE mcp_readonly SET statement_timeout = '5s'`);
  await client.query(`ALTER ROLE mcp_readonly SET idle_in_transaction_session_timeout = '10s'`);
  await client.query(`ALTER ROLE mcp_readonly CONNECTION LIMIT 20`);

  await client.query(`GRANT SELECT (id, name, token_hash, revoked_at) ON mcp_tokens TO mcp_auditor`);
  await client.query(`GRANT UPDATE (last_used_at) ON mcp_tokens TO mcp_auditor`);
  await client.query(`GRANT INSERT ON mcp_audit TO mcp_auditor`);
  await client.query(`ALTER ROLE mcp_auditor SET statement_timeout = '5s'`);
  await client.query(`ALTER ROLE mcp_auditor CONNECTION LIMIT 10`);
}
