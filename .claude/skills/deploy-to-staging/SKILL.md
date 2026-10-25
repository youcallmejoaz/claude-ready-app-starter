---
name: deploy-to-staging
description: Ship the current work to the password protected staging site through a pull request into the staging branch. Use when the owner says "deploy to staging", "put this on staging" or "let me try it". Never deploys to production.
---

# Deploy to staging

Staging deploys happen automatically when a pull request is merged into `staging`
(`.github/workflows/deploy-staging.yml`). Your job is to get a clean pull request there.

1. **Check the branch**: you are on a feature branch, not `main` or `staging`. Commit any
   remaining work with a clear message.
2. **Run the checks locally**: `npm run typecheck && npm test`. If the change touches pages,
   also `npm run build && npm run test:e2e`. Fix anything red before going on.
3. **Check for secrets**: `git diff origin/staging...HEAD` must not contain keys, tokens,
   passwords, `.env` files, real customer data or personal file paths.
4. **Push** the branch and **open a pull request into `staging`** with a short, plain summary:
   what changed, how to see it, and whether it includes a database migration.
5. **Wait for CI** (the green check). If it fails, read the log, fix, push again.
6. **Merge** only if the owner asked you to; otherwise tell them it is ready to merge.
7. After merging, watch **Actions > Deploy to staging** until it finishes, then tell the owner
   the staging address to check. The staging password is in AWS Secrets Manager
   (`claude-ready-staging/BASIC_AUTH_PASSWORD`); never paste it into chat or commits.

Production is out of scope for this skill. When the owner is happy with staging, point them to
"Ship to production" in `docs/HOW_TO_DEPLOY.md`: they run the workflow and approve it themselves.
