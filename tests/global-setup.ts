// Creates a fresh test database and applies the real migrations and role grants.
import pg from "pg";
import { ADMIN_URL, OWNER_URL, TEST_DB, useTestEnv } from "./helpers";
import { runMigrations } from "../scripts/migrate";

export default async function setup() {
  useTestEnv();
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${TEST_DB}"`);
  await admin.end();
  await runMigrations(OWNER_URL);
}
