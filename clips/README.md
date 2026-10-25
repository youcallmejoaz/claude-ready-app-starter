# Clips

Everything here is generated. To re-record:

```bash
npm run build && npm run db:migrate
npm run mcp &                                                   # MCP server on :3001
SYNC_STEP_DELAY_MS=55 PORT=3000 npm start &                     # app (demo mode)
SYNC_STEP_DELAY_MS=55 PORT=3100 STAGING_BASIC_AUTH=1 BASIC_AUTH_USER=team \
  BASIC_AUTH_PASSWORD=staging-demo-pass npm start &             # staging copy
STAGING_DEMO_PASSWORD=staging-demo-pass node clips/record.mjs   # C01 to C07 (reseeds sample data)
node clips/record-cards.mjs                                     # K01 to K04, P01, P02
```

- UI clips are recorded with the Chrome DevTools screencast (sharper than the default
  Playwright video) and encoded with ffmpeg to H.264, 30 fps. A visible cursor and a click ring
  are injected into the page (`lib/recorder.mjs`). Typing runs at about 12 characters per second.
- Cards (`cards/`) and prompt replays (`prompts/`) are plain HTML animations, recorded the same way.
- P01 shows the plan summary from `PLAN.md`. P02 shows the result of really running SHOW
  prompt 2 on a throwaway branch: the tool was added to `mcp/tools.ts`, a test added to
  `tests/mcp.test.ts`, and the MCP test file passed (23 tests). That change was then discarded so
  the prompt can be re-run on camera.
- The staging password used for filming is a throwaway local value, not a real secret.
