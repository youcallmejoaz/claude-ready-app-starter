# CLAUDE.md

Guide for Claude Code working in this repository. Read this first in every session.

## What this project is

A web app for a business owner: sign in with Google, see Google Ads and Google Analytics 4 numbers
that are synced into our own Postgres database every night, and let Claude answer questions about
that data through a **read-only MCP connector**. Code goes to a password protected staging site
first; production changes only when someone approves a deploy.

Two services, one codebase:

- **App** (Next.js, port 3000): dashboard, admin page, demo console, sign-in.
- **MCP server** (`mcp/`, port 3001, path `/mcp`): the connector Claude talks to.

## Folder map

| Path | What lives there |
|---|---|
| `src/app/` | Pages and API routes (App Router) |
| `src/proxy.ts` | Staging password (HTTP basic auth, on when `STAGING_BASIC_AUTH=1`) |
| `src/auth.ts` | Auth.js: Google sign-in, plus a mock Google sign-in in demo mode |
| `src/lib/db/` | Drizzle schema (`schema.ts`), database client, MCP role grants (`roles.ts`) |
| `src/lib/sync/` | Sync jobs (`run.ts`) and adapters: `mock.ts`, `google-ads.ts`, `ga4.ts` |
| `src/lib/analytics/queries.ts` | SQL shared by the dashboard and the MCP tools |
| `src/lib/console/` | Demo console: MCP client, recorded answers, live Claude loop |
| `mcp/` | MCP server: `app.ts` (HTTP + auth), `tools.ts`, `sql-guard.ts`, `audit.ts` |
| `db/migrations/` | Generated SQL migrations. Never edit an applied migration. |
| `scripts/` | migrate, seed, sync, token management |
| `fixtures/console/` | Recorded answers used by the console in demo mode |
| `tests/` | Vitest unit and integration tests (need Postgres) |
| `e2e/` | Playwright end to end tests (need a build, Postgres and seeded data) |
| `infra/aws/` | AWS App Runner, RDS and backup setup |
| `.github/workflows/` | CI, deploy to staging, deploy to production |
| `docs/` | `HOW_TO_DEPLOY.md`, `CONNECT_CLAUDE.md`, `GOOGLE_DATA.md` |

## Commands

```bash
cp .env.example .env          # first time only, then fill in values
docker compose up             # Postgres, app (3000) and MCP server (3001), demo mode
npm ci                        # install exactly what is in package-lock.json
npm run db:migrate            # apply migrations and MCP role grants
npm run seed                  # 90 days of sample data, demo user, prints a demo MCP token once
npm run dev                   # app and MCP server with reload (needs Postgres running)
npm run sync                  # run the Google Ads and GA4 sync once
npm run token -- create "Claude Desktop"   # new connector token (shown once)
npm run token -- list | revoke <id>
npm run typecheck             # TypeScript
npm test                      # Vitest (creates <db>_test, never touches dev data)
npm run build && npm run test:e2e          # Playwright
npm run db:generate -- --name <change>     # after editing src/lib/db/schema.ts
```

## Conventions

- TypeScript strict. Import app code with `@/` (maps to `src/`). Pin exact dependency versions
  (`.npmrc` has `save-exact=true`) and commit `package-lock.json`. Install with `npm ci`.
- Dates are UTC calendar days as `YYYY-MM-DD` strings (`src/lib/dates.ts`).
- Money is stored as `numeric(12,2)` in the ad account currency.
- New analytics SQL goes in `src/lib/analytics/queries.ts` so the dashboard and MCP tools agree.
- Every sync write is an upsert keyed on (entity, date). Syncs must stay idempotent.
- Pages that need a signed-in user call `requireUser()` first. API routes check `auth()`.
- Configuration is read through `src/lib/env.ts`. Every new variable goes in `.env.example`
  with a comment.
- Small commits with clear messages. Run `npm run typecheck && npm test` before pushing.
- Write for a non-technical owner in UI text and docs: plain words, no jargon.

## Hard rules (never break these)

1. **The MCP connector is read only.** Its queries run as `mcp_readonly`, which may only SELECT
   the analytics tables (`READONLY_TABLES` in `src/lib/db/roles.ts`). Never connect the MCP server
   with the owner role, never grant `mcp_readonly` anything but SELECT, never add user, token or
   audit tables to `READONLY_TABLES`.
2. **Writes are blocked twice.** `run_select` must pass `mcp/sql-guard.ts` (one plain SELECT) and
   then run in a read-only transaction under the read-only role. Keep both layers. The tests in
   `tests/db-roles.test.ts` prove INSERT, UPDATE, DELETE and DDL fail at the database level even
   without the parser. Do not weaken or skip them.
3. **No MCP call without a valid token.** Tokens are stored only as SHA-256 hashes and can be
   revoked. Never log, print or store a token in plain text (the seed and `npm run token` show a
   new token once, that is all).
4. **Every MCP call writes an audit row** (`mcp_audit`), including blocked and unauthorized ones.
   New tools must go through the `audited()` wrapper in `mcp/tools.ts`.
5. **Production deploys are manual.** Only `.github/workflows/deploy-production.yml`, started by a
   person, with approval on the `production` GitHub environment. No script, hook or workflow may
   deploy to production automatically.
6. **Staging is never public.** Keep `STAGING_BASIC_AUTH=1` on staging.
7. **Secrets live in environment variables and GitHub environment secrets only.** Never commit
   `.env`, tokens, passwords, API keys, real customer data, emails or personal file paths. Use
   `.env.example` with empty values to document a variable.
8. **Demo mode stays keyless.** `DEMO_MODE=1` must work on a fresh clone with no API keys.

## Adding things

- New feature: see `.claude/skills/add-feature/SKILL.md`.
- Schema change: see `.claude/skills/add-migration/SKILL.md`.
- Ship to staging: see `.claude/skills/deploy-to-staging/SKILL.md`.
- New MCP tool: add it in `mcp/tools.ts` with `registerTool`, a Zod input schema, the
  `audited()` wrapper and `readOnlyHint: true`; query through the read-only pool only; add a test
  in `tests/mcp.test.ts` that checks its numbers against SQL written in the test, and update the
  tool count test.
