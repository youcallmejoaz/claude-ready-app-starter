// First line of defence for run_select: parse with the real Postgres parser (libpg-query)
// and accept only one plain SELECT. The second line is the database role itself, which has
// SELECT on the analytics tables only and runs every transaction read only.
import { parse } from "libpg-query";

export type GuardResult = { ok: true } | { ok: false; reason: string };

const WRITE_NODES = new Set([
  "InsertStmt",
  "UpdateStmt",
  "DeleteStmt",
  "MergeStmt",
  "CreateStmt",
  "CreateTableAsStmt",
  "DropStmt",
  "TruncateStmt",
  "AlterTableStmt",
  "GrantStmt",
  "CopyStmt",
  "CallStmt",
  "DoStmt",
  "VariableSetStmt",
  "LockStmt",
]);

// Functions that sleep, read files, change settings or touch other sessions.
const BLOCKED_FUNCTION = /^(pg_|lo_|dblink|set_config|current_setting|query_to_xml|table_to_xml|cursor_to_xml|database_to_xml|schema_to_xml|nextval|setval|txid_|inet_server|inet_client)/i;

const BLOCKED_SCHEMAS = new Set(["pg_catalog", "information_schema", "pg_toast"]);

function walk(node: unknown, visit: (key: string, value: Record<string, unknown>) => string | undefined): string | undefined {
  // Visits every key whose value is an object or array, depth first.
  if (Array.isArray(node)) {
    for (const item of node) {
      const r = walk(item, visit);
      if (r) return r;
    }
    return undefined;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === "object") {
        const r = visit(key, value as Record<string, unknown>);
        if (r) return r;
      }
      const r = walk(value, visit);
      if (r) return r;
    }
  }
  return undefined;
}

function funcName(fn: Record<string, unknown>): string {
  const parts = (fn.funcname as { String?: { sval?: string } }[] | undefined) ?? [];
  return parts.map((p) => p.String?.sval ?? "").join(".");
}

export async function checkSelect(sql: string): Promise<GuardResult> {
  if (!sql || !sql.trim()) return { ok: false, reason: "Empty query." };
  if (sql.length > 10_000) return { ok: false, reason: "Query is too long (10,000 characters max)." };

  let tree: { stmts?: { stmt: Record<string, unknown> }[] };
  try {
    tree = (await parse(sql)) as unknown as typeof tree;
  } catch (err) {
    return { ok: false, reason: `SQL could not be parsed: ${err instanceof Error ? err.message : String(err)}` };
  }
  const stmts = tree.stmts ?? [];
  if (stmts.length !== 1) return { ok: false, reason: "Only a single statement is allowed." };

  const stmt = stmts[0].stmt;
  const kind = Object.keys(stmt)[0];
  if (kind !== "SelectStmt") {
    return { ok: false, reason: `Only SELECT is allowed (got ${kind.replace(/Stmt$/, "").toUpperCase()}).` };
  }

  const problem = walk(stmt, (key, value) => {
    if (WRITE_NODES.has(key)) return `Data-changing statements are not allowed, even inside a SELECT (${key}).`;
    if (key === "intoClause") return "SELECT INTO is not allowed.";
    if (key === "lockingClause") return "Row locking (FOR UPDATE / FOR SHARE) is not allowed.";
    if (key === "FuncCall") {
      const name = funcName(value);
      const bare = name.split(".").pop() ?? name;
      if (BLOCKED_FUNCTION.test(bare) || name.startsWith("pg_catalog.")) return `Function ${name} is not allowed.`;
    }
    if (key === "RangeVar") {
      const schema = String(value.schemaname ?? "");
      const rel = String(value.relname ?? "");
      if (BLOCKED_SCHEMAS.has(schema) || rel.startsWith("pg_")) {
        return "System catalogs are not available. Use describe_schema to see the tables.";
      }
    }
    return undefined;
  });
  if (problem) return { ok: false, reason: problem };
  return { ok: true };
}
