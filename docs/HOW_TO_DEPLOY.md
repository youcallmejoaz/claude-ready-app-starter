# How to deploy

Plain steps for shipping a change. You do not need to be a developer. Claude Code can do the
technical parts for you: you can say "deploy this to staging" and it will follow
`.claude/skills/deploy-to-staging/SKILL.md`.

## The idea in one picture

```
your change ──> tests run ──> staging (automatic) ──> you check it ──> production (you approve)
```

- **Staging** is a private copy of the app behind a password. Every change lands there first.
- **Production** is the real app. It only changes when you press a button and approve it.

## Everyday flow

### 1. Make the change

Ask Claude Code for what you want, for example "Add a tool that shows cost per conversion by
campaign for any date range." It works on a separate branch and runs the tests.

### 2. Send it to staging

1. On GitHub, open a pull request from the change branch into `staging`.
2. Wait for the green check (the tests). If it is red, ask Claude Code to fix it.
3. Click **Merge**. GitHub now deploys to staging by itself. Watch it under **Actions >
   Deploy to staging**. It takes about 5 to 10 minutes.

### 3. Check staging

Open your staging address (for example `https://staging.example.com`). Your browser asks for
the staging username and password. Click through the change. Nothing you do on staging
affects real customers.

### 4. Ship to production

1. On GitHub, open a pull request from `staging` into `main` and merge it.
2. Go to **Actions > Deploy to production > Run workflow**.
3. Paste the commit id that staging is running. You find it at the bottom of the latest
   **Deploy to staging** run ("Staging now runs commit ...").
4. Click **Run workflow**. GitHub asks the approver to approve. After approval the exact same
   build that ran on staging goes live. Nothing is rebuilt.

### Undo a bad release

Run **Deploy to production** again with the previous commit id. It switches back in a few
minutes. The database is not rolled back, so ask Claude Code first if the change included a
database migration.

## First-time setup (once, about half a day)

Someone comfortable with AWS does this once; after that the flow above is all you need.

1. **AWS**: follow `infra/aws/README.md`. It creates the database, the two app services for
   staging and production, HTTPS on your domains, and nightly backups.
2. **GitHub environments**: in the repository, **Settings > Environments**:
   - `staging`: no approval needed.
   - `production`: tick **Required reviewers** and add yourself. This is the approval step.
3. **GitHub settings** (Settings > Secrets and variables > Actions):
   - Secret `AWS_DEPLOY_ROLE_ARN`: the deploy role from the AWS setup.
   - Variables `AWS_REGION`, `AWS_DEPLOY_ENABLED=true`, and the four service ids printed by
     the setup script (`APP_RUNNER_STAGING_APP_ARN`, `APP_RUNNER_STAGING_MCP_ARN`,
     `APP_RUNNER_PRODUCTION_APP_ARN`, `APP_RUNNER_PRODUCTION_MCP_ARN`).
   - For the nightly sync: variables `STAGING_APP_URL`, `PRODUCTION_APP_URL` and secrets
     `CRON_SECRET_STAGING`, `CRON_SECRET_PRODUCTION` (copy them from AWS Secrets Manager).
4. **Branches**: create a `staging` branch from `main`. Under **Settings > Branches** protect
   `main` and `staging` so changes only arrive through pull requests with passing tests.
5. **Google**: add your Google sign-in client and, when ready, the Google Ads and GA4 details
   (`docs/GOOGLE_DATA.md`) to the App Runner services as environment variables.
6. **Claude**: create a connector token and add it to Claude (`docs/CONNECT_CLAUDE.md`).

## Where things are

| What | Where |
|---|---|
| Test and deploy runs | GitHub > Actions |
| Who approved a production deploy | The production run on GitHub > Actions |
| App logs | AWS console > App Runner > service > Logs |
| Database backups | AWS console > RDS > database > Maintenance & backups (kept 14 days, taken nightly) |
| What Claude looked at | App > Data & connector > Connector audit log |
| Staging password | AWS Secrets Manager, `claude-ready-staging/BASIC_AUTH_PASSWORD` |

## Running cost (estimate)

A small setup like this (two small App Runner services and a small managed Postgres per
environment) typically costs **tens of dollars a month** on AWS. This is an estimate, not a
quote: check the AWS pricing calculator for your region and traffic. Connector calls cost
nothing extra beyond your Claude plan.
