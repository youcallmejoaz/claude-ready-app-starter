// Applies database migrations, then creates or updates the MCP roles and grants.
// Usage: npm run db:migrate
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { setupMcpRoles } from "../src/lib/db/roles";

export async function runMigrations(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const readonlyPassword = process.env.MCP_READONLY_PASSWORD;
  const auditPassword = process.env.MCP_AUDIT_PASSWORD;
  if (!readonlyPassword || !auditPassword) {
    throw new Error("MCP_READONLY_PASSWORD and MCP_AUDIT_PASSWORD must be set");
  }
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    // Several app containers may start at once; only one migrates at a time.
    await client.query("SELECT pg_advisory_lock(727274)");
    await migrate(drizzle(client), { migrationsFolder: "db/migrations" });
    const { rows } = await client.query<{ db: string }>("SELECT current_database() AS db");
    await setupMcpRoles(client, { database: rows[0].db, readonlyPassword, auditPassword });
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => console.log("Migrations applied and MCP roles updated."))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
