# Claude Ready App Starter

A production-ready app foundation you can keep building with Claude Code, plus a secure
read-only connector so Claude can answer questions about your Google Ads and Analytics data.

> This repository is a demo build on sample data. It contains no client data.

## The problem

You want to build your product with Claude Code, but:

- there is no safe place to try changes before customers see them,
- nobody set up the database, sign-in, backups and deploys properly,
- and Claude cannot see your business numbers, so it cannot answer simple questions like
  "which campaign gets the cheapest conversions?"

## What it does

1. **Sign in with Google** and see your marketing dashboard: traffic, ad spend, cost per
   conversion by campaign, top landing pages.
2. **Your Google Ads and GA4 numbers are copied into your own database every night.**
3. **Every change goes to a password protected staging site first.** Production only changes
   when you approve it.
4. **Claude connects through a private, read-only connector** and answers questions about your
   data. Anything that tries to change data is blocked, twice, and logged.

## Safeguards

| Safeguard | How it is enforced | Proof |
|---|---|---|
| Claude can only read | The connector's database user can only SELECT the analytics tables, and every query runs in a read-only transaction | `tests/db-roles.test.ts` runs INSERT, UPDATE, DELETE and DDL directly as that user and checks they fail |
| Bad queries are stopped before the database | `run_select` parses SQL with the real Postgres parser and accepts one plain SELECT only; 5 second limit; 500 rows max | `tests/sql-guard.test.ts`, `tests/mcp.test.ts` |
| No token, no access | Every connector request needs a token; tokens are stored as hashes and can be revoked instantly | `tests/mcp.test.ts` (401 without a token and with a revoked one) |
| Everything is logged | Every connector call, allowed, blocked or rejected, writes an audit row you can see in the app | `tests/mcp.test.ts`, `e2e/app.spec.ts` |
| Staging is private | Password on every page when `STAGING_BASIC_AUTH=1` | `tests/basic-auth.test.ts`, `e2e/staging.spec.ts` |
| Production needs a person | Production deploys only run by hand and wait for an approver | `.github/workflows/deploy-production.yml` |
| Secrets stay out of the code | Environment variables and GitHub / AWS secrets only | `.env.example`, `.gitignore` |

## Demo

- Proposal cut (60 to 90 seconds): [`clips/proposal_cut.mp4`](clips/proposal_cut.mp4)
- YouTube walkthrough: _link coming soon_

## Try it in two minutes (no keys needed)

```bash
git clone https://github.com/youcallmejoaz/claude-ready-app-starter.git
cd claude-ready-app-starter
docker compose up
```

Open http://localhost:3000 and click **Sign in with Google** (in demo mode this is a mock
sign-in with a sample account). The demo connector token is printed once in the setup logs:
`docker compose logs setup`.

Demo mode (`DEMO_MODE=1`, the default) uses 90 days of sample data for three campaigns
(Search Brand, Search Generic and Performance Max, the last one clearly underperforming) and
eight landing pages. The **Ask Claude** page replays recorded answers: the wording was written
in advance, but the tool calls run live against the connector, so the numbers and the audit
log are real.

## Setup for development

Needs Node.js 22 and Postgres 16 (or just Docker).

```bash
cp .env.example .env        # fill in the two MCP passwords and AUTH_SECRET
npm ci                      # installs exactly what package-lock.json says
npm run db:migrate          # tables, plus the read-only and audit database users
npm run seed                # sample data and a demo connector token (shown once)
npm run dev                 # app on :3000, connector on :3001
```

Switch to real mode with `DEMO_MODE=0`: Google sign-in (`AUTH_GOOGLE_ID`,
`AUTH_GOOGLE_SECRET`), live Claude answers in the console (`ANTHROPIC_API_KEY`), and real Google
data (`docs/GOOGLE_DATA.md`).

## Connect Claude

Create a token on the **Data & connector** page, then in Claude add a custom connector with the
URL `https://<your MCP domain>/mcp` and the request header `Authorization: Bearer <token>`.
Full steps for Claude, Claude Code and the API: [`docs/CONNECT_CLAUDE.md`](docs/CONNECT_CLAUDE.md).

Connector tools: `describe_schema`, `traffic_summary(start, end)`,
`campaign_performance(start, end, sort_by)`, `top_landing_pages(start, end)`, `run_select(sql)`.

## Deploying

Plain-language guide: [`docs/HOW_TO_DEPLOY.md`](docs/HOW_TO_DEPLOY.md).
AWS setup (App Runner, RDS Postgres 16 with nightly backups, HTTPS on both subdomains):
[`infra/aws/README.md`](infra/aws/README.md).

```
push to a branch ──> CI tests
merge into staging ──> CI tests ──> build images ──> staging (automatic)
run "Deploy to production" ──> approval ──> same images to production
```

## Architecture

```
Browser ──> Next.js app (3000) ───────────────┐ owner role
              └─ demo console ─MCP client─┐    v
Claude ──────────────────────────────> MCP server (3001, /mcp) ──> Postgres 16
                                         ├─ queries as mcp_readonly (SELECT, analytics only)
                                         └─ audit as mcp_auditor (insert audit rows only)
```

| Part | Tech |
|---|---|
| App | Next.js 16 (App Router), TypeScript, Auth.js (Google) |
| Database | Postgres 16, Drizzle ORM migrations |
| Connector | MCP TypeScript SDK, Streamable HTTP, Zod, `libpg-query` (the real Postgres parser) |
| Claude | Anthropic SDK (live console mode) |
| Tests | Vitest, Playwright |
| Delivery | Docker, GitHub Actions, AWS App Runner, RDS |

Folder map, commands and rules for Claude Code: [`CLAUDE.md`](CLAUDE.md). Build plan:
[`PLAN.md`](PLAN.md).

## Tests

```bash
npm test                        # unit and integration (needs Postgres; uses a separate _test database)
npm run build && npm run test:e2e   # end to end in a real browser
```

CI runs both on every push with a Postgres 16 service.

## Honest limits

- The Google Ads API needs an approved developer token for real accounts. The demo uses
  sample data, and the live Google adapters are tested only against mocked API responses.
- The AWS setup is documented and scripted, but you deploy it on your own AWS account. The
  script has not been run against a live account in this build.
- The console's demo answers are written in advance (the tool calls are real). Live Claude
  answers need `ANTHROPIC_API_KEY` and `DEMO_MODE=0`.
- Running cost (estimate): a small AWS setup like this is typically tens of dollars a month.
  Connector calls cost nothing beyond your Claude plan.
