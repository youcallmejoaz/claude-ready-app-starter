// Manage MCP connector tokens.
//   npm run token -- create "Claude Desktop"   prints a new token once
//   npm run token -- list
//   npm run token -- revoke <id>
import { desc, eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/lib/db/client";
import { mcpTokens } from "../src/lib/db/schema";
import { generateToken, hashToken } from "../src/lib/mcp-tokens";

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const db = getDb();
  if (cmd === "create") {
    const name = arg || "unnamed";
    const token = generateToken();
    const [row] = await db.insert(mcpTokens).values({ name, tokenHash: hashToken(token) }).returning({ id: mcpTokens.id });
    console.log(`Created token "${name}" (id ${row.id}). Copy it now, it will not be shown again:\n  ${token}`);
  } else if (cmd === "list") {
    const rows = await db
      .select({ id: mcpTokens.id, name: mcpTokens.name, createdAt: mcpTokens.createdAt, lastUsedAt: mcpTokens.lastUsedAt, revokedAt: mcpTokens.revokedAt })
      .from(mcpTokens)
      .orderBy(desc(mcpTokens.createdAt));
    console.table(rows);
  } else if (cmd === "revoke" && arg) {
    const r = await db.update(mcpTokens).set({ revokedAt: new Date() }).where(eq(mcpTokens.id, arg)).returning({ id: mcpTokens.id });
    console.log(r.length ? `Revoked ${arg}` : `No token with id ${arg}`);
  } else {
    console.log('Usage: npm run token -- create "<name>" | list | revoke <id>');
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
