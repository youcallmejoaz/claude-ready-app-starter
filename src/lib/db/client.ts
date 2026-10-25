import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

// The app connects as the owner role (read and write). The MCP server never uses this pool.
const globalForDb = globalThis as unknown as { appPool?: pg.Pool; appDb?: NodePgDatabase<typeof schema> };

export function getPool(): pg.Pool {
  if (!globalForDb.appPool) {
    globalForDb.appPool = new pg.Pool({ connectionString: env.databaseUrl, max: 10 });
  }
  return globalForDb.appPool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!globalForDb.appDb) {
    globalForDb.appDb = drizzle(getPool(), { schema });
  }
  return globalForDb.appDb;
}

export async function closeDb(): Promise<void> {
  await globalForDb.appPool?.end();
  globalForDb.appPool = undefined;
  globalForDb.appDb = undefined;
}
