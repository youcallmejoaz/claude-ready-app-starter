---
name: add-feature
description: Add a feature to this app (a page, an API route, a dashboard widget or a new MCP tool) the way this repo expects, with tests. Use when the owner asks for anything new in the app or the connector.
---

# Add a feature

1. **Restate the request** in one or two plain sentences and name the files you expect to touch.
   If it needs a schema change, also follow the `add-migration` skill.
2. **Branch**: `git checkout -b feature/<short-name>` from the latest `staging`.
3. **Find the pattern to copy**:
   - Page: `src/app/<name>/page.tsx`, call `requireUser()` first, reuse `TopBar` and the
     classes in `src/app/globals.css`.
   - API route: `src/app/api/<name>/route.ts`, check `auth()` and return 401 when signed out,
     validate input with Zod.
   - Numbers shown in the app or given to Claude: write the SQL once in
     `src/lib/analytics/queries.ts`.
   - New MCP tool: `mcp/tools.ts`. Use `server.registerTool` with a Zod `inputSchema`,
     `annotations: { readOnlyHint: true }`, wrap the body in `audited(ctx, "<tool>", input, ...)`,
     and query only through `ctx.readonlyPool`. Never give the MCP server another pool.
   - New setting: read it in `src/lib/env.ts` and document it in `.env.example`.
4. **Tests** (always):
   - Logic and SQL: a Vitest file in `tests/`. For an MCP tool, extend `tests/mcp.test.ts`:
     call the tool and compare its numbers with SQL written in the test; update the tool count.
   - A user-visible flow: a Playwright test in `e2e/`.
5. **Check**: `npm run typecheck && npm test`. For UI changes also `npm run build && npm run test:e2e`.
   Fix failures; never skip or weaken a test, especially `tests/db-roles.test.ts`.
6. **Demo mode** must still work with no keys. If the console should answer a new question in
   demo mode, add an entry to `fixtures/console/recorded-answers.json`.
7. **Commit** in small steps with clear messages, push the branch, open a pull request into
   `staging`, and tell the owner in plain words what changed and how to see it on staging.

Never: commit secrets or `.env`, connect the MCP server as the owner role, grant the MCP roles
more than they have in `src/lib/db/roles.ts`, or deploy to production.
