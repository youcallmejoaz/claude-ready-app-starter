---
name: add-migration
description: Change the database schema safely with Drizzle (new table, column or index), including MCP role grants and tests. Use whenever src/lib/db/schema.ts needs to change.
---

# Add a database migration

1. **Edit the schema** in `src/lib/db/schema.ts`. Prefer additive changes (new tables, new
   nullable columns, columns with defaults). Renames and drops need a two-step plan; explain it
   to the owner first.
2. **Generate the SQL**: `npm run db:generate -- --name <what_changed>`. Read the new file in
   `db/migrations/` and make sure it does only what you meant. Never edit a migration that is
   already on `staging` or `main`; add a new one instead.
3. **Plain-language comments**: if the table should be visible to Claude, add
   `COMMENT ON TABLE/COLUMN` statements in a custom migration
   (`npx drizzle-kit generate --custom --name <name>_comments`), like `0001_table_comments.sql`.
4. **Decide what the connector may see**:
   - Analytics data Claude should read: add the table name to `READONLY_TABLES` in
     `src/lib/db/roles.ts`. SELECT only.
   - Anything with people, credentials, tokens or audit data: do **not** add it.
   - Update the `describe_schema` expectation in `tests/mcp.test.ts`.
5. **Apply locally**: `npm run db:migrate` (this also re-applies the role grants).
6. **Sync jobs**: if the sync writes the new table, use an upsert keyed on (entity, date) and
   extend `tests/sync.test.ts` so running twice does not duplicate rows.
7. **Test**: `npm run typecheck && npm test`. `tests/db-roles.test.ts` must still pass.
8. **Deploy**: migrations run automatically when the app container starts
   (`docker/start-app.sh`, guarded by a lock), first on staging, later on production.
