# AWS setup

Target: **AWS App Runner** for the two containers, **Amazon RDS for PostgreSQL 16** for the
database, **Amazon ECR** for images, **Secrets Manager** for secrets. One set per environment.

```
                 HTTPS (App Runner managed certificates)
staging.example.com ──> App Runner: claude-ready-staging-app ─┐
mcp-staging.example.com ──> App Runner: claude-ready-staging-mcp ─┤ VPC connector
                                                                   └──> RDS Postgres 16 (private)
app.example.com / mcp.example.com ──> the same, for production
```

Why App Runner: HTTPS, health checks, rolling deploys and logs are built in, with no servers or
load balancers to manage. Lightsail containers are a cheaper alternative with a similar flow
but need a separate managed database setup; App Runner is what the scripts here target.

## What the setup gives you

| Requirement | How |
|---|---|
| HTTPS on both subdomains | App Runner custom domains issue and renew certificates automatically |
| Password protected staging | `STAGING_BASIC_AUTH=1` on the staging app service, password in Secrets Manager |
| Nightly Postgres backups | RDS automated backups every night (02:00 to 02:30 UTC), kept 14 days, point-in-time restore |
| Read-only connector | The MCP service only gets the `mcp_readonly` and `mcp_auditor` connection strings |
| Secrets out of git | Secrets Manager, injected into App Runner as environment secrets |
| Manual production deploys | GitHub `production` environment with required reviewers |

## Steps

1. **Install** the AWS CLI v2 and `jq`, and sign in (`aws configure sso` or an admin profile).
2. **Pick a region** and note a VPC with at least two private subnets (the default VPC works
   for a start, but its subnets are public; for production use private subnets).
3. **Push a first image** (App Runner needs one to start):
   ```bash
   aws ecr create-repository --repository-name claude-ready-app --image-scanning-configuration scanOnPush=true
   aws ecr create-repository --repository-name claude-ready-mcp --image-scanning-configuration scanOnPush=true
   aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
   docker build --target app -t <registry>/claude-ready-app:<sha> . && docker push <registry>/claude-ready-app:<sha>
   docker build --target mcp -t <registry>/claude-ready-mcp:<sha> . && docker push <registry>/claude-ready-mcp:<sha>
   ```
   `<sha>` is the commit id (`git rev-parse HEAD`). Later deploys push images automatically.
4. **Run the setup script** once per environment:
   ```bash
   ENV_NAME=staging AWS_REGION=eu-west-2 VPC_ID=vpc-... SUBNET_IDS=subnet-a,subnet-b \
   APP_DOMAIN=staging.example.com MCP_DOMAIN=mcp-staging.example.com IMAGE_TAG=<sha> \
   ./infra/aws/setup.sh
   ```
   Then the same with `ENV_NAME=production` and your production domains.
5. **DNS**: add the records the script prints (certificate validation and CNAME) at your
   domain registrar. HTTPS starts working once they validate (usually under an hour).
6. **GitHub deploy role** (OIDC, no stored AWS keys): create an IAM role trusted by
   `token.actions.githubusercontent.com` for this repository, allowed to push to the two ECR
   repositories and call `apprunner:UpdateService`, `apprunner:DescribeService`,
   `apprunner:ListOperations`. Example trust condition:
   `"token.actions.githubusercontent.com:sub": "repo:<owner>/<repo>:environment:*"`.
   Put its ARN in the GitHub secret `AWS_DEPLOY_ROLE_ARN`.
7. **Real mode settings**: in the App Runner console, add `AUTH_GOOGLE_ID`,
   `AUTH_GOOGLE_SECRET`, `AUTH_ALLOWED_EMAILS`, and when ready the Google data variables and
   `ANTHROPIC_API_KEY` (as secrets). See `.env.example` for the full list.

## Restoring a backup

RDS console > the database > **Actions > Restore to point in time**. This creates a new
database; point `DATABASE_URL` (and the two MCP URLs) at it, or rename it into place.
For an extra off-site copy, `pg_dump` the database to S3 on a schedule; it is not set up here.

## Known gaps

- The script has not been run against a live AWS account as part of this build. Run it step by
  step the first time.
- Connections use `sslmode=no-verify` (encrypted, but the RDS certificate is not checked). To
  verify it, add the RDS CA bundle to the images and switch to `sslmode=verify-full`.
- One small instance per service; raise App Runner min instances for production traffic.
