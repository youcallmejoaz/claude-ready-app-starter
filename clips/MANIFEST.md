# Clip manifest

All clips: 1920 x 1080, 30 fps, H.264 (yuv420p), no audio. Recorded in demo mode with sample
data. Durations from ffprobe.

| Clip ID | File | Duration | What it shows | Video section |
|---|---|---|---|---|
| K01 | `K01_problem.mp4` | 6.1 s | Card: you want to build with Claude Code, but there is no safe foundation and Claude cannot see your data | 1. Problem |
| P01 | `P01_plan_prompt.mp4` | 8.0 s | Terminal replay: SHOW prompt 1 typed, plan summary from PLAN.md appears | 2. The build |
| C01 | `C01_signin_dashboard.mp4` | 7.4 s | Mock Google sign-in, dashboard with traffic chart and cost per conversion by campaign | 2. Result |
| C02 | `C02_sync_now.mp4` | 11.2 s | Admin page: Sync now, Google Ads and GA4 row counts go from 0 to 270 and 810, last synced time updates | 2. Result |
| C03 | `C03_staging_password.mp4` | 9.1 s | Staging returns the password page, username and masked password entered, staging app loads | 3. Safe deploys |
| K02 | `K02_deploy_flow.mp4` | 8.1 s | Card: code change, tests, staging (automatic), production (manual approval) | 3. Safe deploys |
| C04 | `C04_console_best_cpa.mp4` | 14.0 s | Console: asks which campaign had the best cost per conversion in the last 30 days, campaign_performance tool call, table and answer | 4. Claude reads your data |
| P02 | `P02_new_tool_prompt.mp4` | 8.0 s | Terminal replay: SHOW prompt 2 typed, new cost_per_conversion tool appears in the tool list (from a real run, see clips/README.md) | 4. Claude reads your data |
| C05 | `C05_console_delete_blocked.mp4` | 9.3 s | Console: asks to delete all campaigns, run_select blocked, read only message | 5. Safeguards |
| C06 | `C06_audit_row.mp4` | 5.4 s | Audit log with the blocked DELETE row | 5. Safeguards |
| C06 (close) | `C06_audit_row_close.mp4` | 5.4 s | Close up of the blocked audit row: DELETE FROM ads_campaigns, blocked, reason | 5. Safeguards |
| K03 | `K03_safeguards.mp4` | 7.1 s | Card: read-only role, token required, audit log, manual production deploys | 5. Safeguards |
| C07 | `C07_claude_md_docs.mp4` | 12.0 s | CLAUDE.md and HOW_TO_DEPLOY.md rendered in the app, scrolling | 6. Handover |
| K04 | `K04_offer.mp4` | 7.1 s | Card: what you get in a week, running cost labelled as an estimate | 7. Offer |

Stills: `stills/K01_problem.png` to `stills/K04_offer.png`. Check frames: `frames/`.
