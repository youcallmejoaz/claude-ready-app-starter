# Build plan: Claude Code ready app foundation with a read-only analytics MCP

## Goal

A production-ready starting point a non-developer can keep building with Claude Code:
a Next.js app with Google sign-in, Google Ads and GA4 numbers synced into Postgres every day,
a staging site behind a password, manual production deploys, and a read-only MCP connector
so Claude can answer questions about the marketing data.

## Architecture

```
Browser ──> Next.js app (port 3000) ──> Postgres 16
               │  (role: app_owner, read and write)
               │
               └─ demo console ──MCP client──┐
                                             v
Claude (Claude Code, Desktop, API) ──> MCP server (port 3001, /mcp, Streamable HTTP)
                                         │  bearer token required
                                         ├─ queries: role mcp_readonly (SELECT only, analytics tables only)
                                         └─ audit:   role mcp_auditor  (INSERT into mcp_audit, check tokens)
```

- Two services, one codebase: `src/` (Next.js app) and `mcp/` (MCP server). Both share `src/lib/db`.
- The MCP server never connects as the app owner. Query tools use `mcp_readonly`, which can only
  SELECT the analytics tables and has `default_transaction_read_only = on` and a 5 second
  statement timeout. A second, tiny role `mcp_auditor` can only check tokens and insert audit rows.
  (The brief says "a role with SELECT only". Audit rows still have to be written somewhere, so
  that write lives in a separate role that can touch nothing else.)

## Data model

| Table | Purpose |
|---|---|
| `users`, `accounts`, `sessions`, `verification_tokens` | Auth.js (Google sign-in) |
| `ads_campaigns` | Google Ads campaigns (id, name, type, status) |
| `ads_daily_metrics` | One row per campaign per day: cost, impressions, clicks, conversions. PK (campaign_id, date) |
| `ga4_daily_metrics` | One row per day: sessions, users, conversions. PK (date) |
| `ga4_landing_pages_daily` | One row per landing page per day. PK (date, landing_page) |
| `sync_runs` | Every sync job: source, adapter, status, rows, timing |
| `mcp_tokens` | Connector tokens, stored as SHA-256 hashes, revocable |
| `mcp_audit` | One row per MCP call (allowed, blocked, error or unauthorized) |

Primary keys on (entity, date) plus `ON CONFLICT DO UPDATE` make every sync idempotent.

## Folder layout

```
src/app/            pages (dashboard, sign-in, admin, console, docs) and API routes
src/proxy.ts        staging password (HTTP basic auth, switched on by STAGING_BASIC_AUTH=1)
src/auth.ts         Auth.js config (Google, plus a mock Google sign-in in demo mode)
src/lib/db/         Drizzle schema, client, role setup
src/lib/sync/       sync jobs and adapters (mock, Google Ads, GA4)
src/lib/analytics/  SQL used by both the dashboard and the MCP tools
src/lib/console/    demo console (MCP client, recorded answers, live Claude loop)
mcp/                MCP server: HTTP entry, auth, audit, tools, SQL guard
db/migrations/      Drizzle SQL migrations
scripts/            migrate, seed, sync, token create and revoke, backup
fixtures/console/   recorded Claude answers for demo mode
tests/              Vitest unit and integration tests (real Postgres)
e2e/                Playwright end to end tests
infra/aws/          App Runner and backup setup, documented and scripted
.github/workflows/  CI, deploy to staging, deploy to production (manual)
.claude/skills/     add-feature, add-migration, deploy-to-staging
clips/              Playwright recordings, cards, proposal cut
```

## Features mapped to the evidence

| Feature | Evidence (Oct 24 post unless noted) |
|---|---|
| Next.js + TypeScript app, dashboard | "set up my app so I can build it with AI" |
| `staging` and `main` branches, CI on push | "staging and main branches" |
| Auto deploy to staging, manual production with environment approval | "auto deploy to staging, manual production deploys" |
| Dockerfiles, AWS App Runner target, HTTPS, nightly backups | "AWS hosting with HTTPS", "Postgres with backups" |
| Basic auth on staging behind a flag | "password protected staging site" |
| Auth.js Google sign-in | "Google sign-in" |
| Google Ads and GA4 sync into Postgres (mock by default) | "Google Ads API and GA4 Data API data stored in the database"; Oct 22 keyword table |
| Hosted MCP server, bearer token, read-only role, audit | "hosted MCP server ... read-only database user and authentication"; signal S1 |
| `run_select` SQL guard, timeouts, row cap | signal S1 (scoped permissions) |
| CLAUDE.md, three skills, HOW_TO_DEPLOY.md | "Claude Code handover with CLAUDE.md, and a deploy walkthrough" |
| Demo console | shows the connector working without any keys |

## Test plan

- Unit: SQL guard (allowed and blocked statements, functions, schemas), basic auth parser,
  mock data generator (deterministic, 3 campaigns, 90 days), Google adapters (mapping from API
  responses, with `fetch` mocked).
- Integration (real Postgres): read-only role rejects INSERT, UPDATE, DELETE and DDL directly;
  sync twice gives the same row counts; each MCP tool matches SQL written in the test;
  MCP returns 401 without a token and with a revoked token; every MCP call writes an audit row.
- End to end (Playwright): staging returns 401 without basic auth when the flag is on;
  demo sign-in, dashboard, sync, console answer, blocked delete.
- CI runs all of the above on every push with a Postgres 16 service.

## Build order

1. Scaffold, lint and type check, env handling, Docker Compose with Postgres.
2. Schema, migrations, roles, seed.
3. Mock adapter and sync jobs, then real adapters behind flags.
4. MCP server: auth, audit, tools, SQL guard. Tests.
5. App: sign-in, dashboard, admin, console, docs pages, staging password.
6. CI and deploy workflows, Dockerfiles, AWS docs and scripts, backups.
7. CLAUDE.md, skills, HOW_TO_DEPLOY.md, README.
8. Clips, proposal cut, portfolio text, cover images.

## Later (not in this build)

- OAuth for the MCP server, so each person signs in with their own account instead of sharing
  one connector token (the token works today through the connector "Request headers" field).
- Per-user data separation (multi-tenant). This build assumes one business per deployment.
- Shopify and other sources.
- Infrastructure as code (Terraform or CDK) instead of the documented CLI script.
