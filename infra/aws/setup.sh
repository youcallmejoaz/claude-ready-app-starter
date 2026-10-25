#!/usr/bin/env bash
# One-time AWS setup for ONE environment (run it twice: staging, then production).
# Creates: ECR repositories (first run only), a private RDS Postgres 16 database with nightly
# automated backups, Secrets Manager secrets, and two App Runner services (app and MCP) with HTTPS.
#
# Needs: AWS CLI v2, jq, and an AWS account where you can create these resources.
# Read infra/aws/README.md first. This script has not been run against a live account as part
# of this build: run it step by step the first time and check each resource in the console.
#
# Usage:
#   ENV_NAME=staging AWS_REGION=eu-west-2 VPC_ID=vpc-... SUBNET_IDS=subnet-a,subnet-b \
#   APP_DOMAIN=staging.example.com MCP_DOMAIN=mcp-staging.example.com \
#   IMAGE_TAG=<commit sha already pushed to ECR> ./infra/aws/setup.sh
set -euo pipefail

: "${ENV_NAME:?staging or production}" "${AWS_REGION:?}" "${VPC_ID:?}" "${SUBNET_IDS:?comma separated private subnets}"
: "${APP_DOMAIN:?}" "${MCP_DOMAIN:?}" "${IMAGE_TAG:?}"
export AWS_REGION
PREFIX="claude-ready-$ENV_NAME"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com"
rand() { openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | head -c 32; }

echo "== 1. Container registries"
for repo in claude-ready-app claude-ready-mcp; do
  aws ecr describe-repositories --repository-names "$repo" >/dev/null 2>&1 ||
    aws ecr create-repository --repository-name "$repo" --image-scanning-configuration scanOnPush=true >/dev/null
done

echo "== 2. Network: database security group, reachable only from App Runner"
SG_APP=$(aws ec2 create-security-group --group-name "$PREFIX-apprunner" --description "App Runner egress" --vpc-id "$VPC_ID" --query GroupId --output text)
SG_DB=$(aws ec2 create-security-group --group-name "$PREFIX-db" --description "Postgres from App Runner only" --vpc-id "$VPC_ID" --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id "$SG_DB" --protocol tcp --port 5432 --source-group "$SG_APP" >/dev/null
aws rds create-db-subnet-group --db-subnet-group-name "$PREFIX" --db-subnet-group-description "$PREFIX" \
  --subnet-ids $(echo "$SUBNET_IDS" | tr ',' ' ') >/dev/null
CONNECTOR_ARN=$(aws apprunner create-vpc-connector --vpc-connector-name "$PREFIX" \
  --subnets $(echo "$SUBNET_IDS" | tr ',' ' ') --security-groups "$SG_APP" --query VpcConnector.VpcConnectorArn --output text)

echo "== 3. Postgres 16 (private, encrypted, nightly backups kept 14 days)"
OWNER_PW=$(rand); RO_PW=$(rand); AUDIT_PW=$(rand)
aws rds create-db-instance --db-instance-identifier "$PREFIX" --engine postgres --engine-version 16 \
  --db-instance-class db.t4g.micro --allocated-storage 20 --storage-type gp3 --storage-encrypted \
  --master-username app_owner --master-user-password "$OWNER_PW" --db-name app \
  --vpc-security-group-ids "$SG_DB" --db-subnet-group-name "$PREFIX" --no-publicly-accessible \
  --backup-retention-period 14 --preferred-backup-window 02:00-02:30 \
  --deletion-protection --copy-tags-to-snapshot >/dev/null
echo "   waiting for the database (10 to 15 minutes)..."
aws rds wait db-instance-available --db-instance-identifier "$PREFIX"
DB_HOST=$(aws rds describe-db-instances --db-instance-identifier "$PREFIX" --query 'DBInstances[0].Endpoint.Address' --output text)

echo "== 4. Secrets (stored in AWS Secrets Manager, never in git)"
secret() { aws secretsmanager create-secret --name "$PREFIX/$1" --secret-string "$2" --query ARN --output text; }
S_DB=$(secret DATABASE_URL "postgres://app_owner:$OWNER_PW@$DB_HOST:5432/app?sslmode=no-verify")
S_RO=$(secret MCP_READONLY_DATABASE_URL "postgres://mcp_readonly:$RO_PW@$DB_HOST:5432/app?sslmode=no-verify")
S_AU=$(secret MCP_AUDIT_DATABASE_URL "postgres://mcp_auditor:$AUDIT_PW@$DB_HOST:5432/app?sslmode=no-verify")
S_ROPW=$(secret MCP_READONLY_PASSWORD "$RO_PW")
S_AUPW=$(secret MCP_AUDIT_PASSWORD "$AUDIT_PW")
S_AUTH=$(secret AUTH_SECRET "$(openssl rand -base64 32)")
S_CRON=$(secret CRON_SECRET "$(rand)")
S_BASIC=$(secret BASIC_AUTH_PASSWORD "$(rand)")
echo "   Fill in Google and Anthropic values later in the App Runner console (see README)."

echo "== 5. IAM roles for App Runner"
cat > /tmp/apprunner-trust.json <<JSON
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":["build.apprunner.amazonaws.com","tasks.apprunner.amazonaws.com"]},"Action":"sts:AssumeRole"}]}
JSON
aws iam create-role --role-name "$PREFIX-ecr-access" --assume-role-policy-document file:///tmp/apprunner-trust.json >/dev/null
aws iam attach-role-policy --role-name "$PREFIX-ecr-access" --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess
aws iam create-role --role-name "$PREFIX-instance" --assume-role-policy-document file:///tmp/apprunner-trust.json >/dev/null
aws iam put-role-policy --role-name "$PREFIX-instance" --policy-name read-secrets --policy-document \
  "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"secretsmanager:GetSecretValue\",\"Resource\":\"arn:aws:secretsmanager:$AWS_REGION:$ACCOUNT:secret:$PREFIX/*\"}]}"
ACCESS_ROLE="arn:aws:iam::$ACCOUNT:role/$PREFIX-ecr-access"
INSTANCE_ROLE="arn:aws:iam::$ACCOUNT:role/$PREFIX-instance"
sleep 10 # IAM is eventually consistent

STAGING_FLAG=0; [ "$ENV_NAME" = staging ] && STAGING_FLAG=1

create_service() { # name image port healthpath envjson secretsjson
  aws apprunner create-service --service-name "$1" \
    --source-configuration "{\"AuthenticationConfiguration\":{\"AccessRoleArn\":\"$ACCESS_ROLE\"},\"AutoDeploymentsEnabled\":false,
      \"ImageRepository\":{\"ImageRepositoryType\":\"ECR\",\"ImageIdentifier\":\"$2\",\"ImageConfiguration\":{\"Port\":\"$3\",
      \"RuntimeEnvironmentVariables\":$5,\"RuntimeEnvironmentSecrets\":$6}}}" \
    --instance-configuration "{\"Cpu\":\"0.25 vCPU\",\"Memory\":\"0.5 GB\",\"InstanceRoleArn\":\"$INSTANCE_ROLE\"}" \
    --network-configuration "{\"EgressConfiguration\":{\"EgressType\":\"VPC\",\"VpcConnectorArn\":\"$CONNECTOR_ARN\"}}" \
    --health-check-configuration "{\"Protocol\":\"HTTP\",\"Path\":\"$4\"}" \
    --query Service.ServiceArn --output text
}

echo "== 6. App Runner services (HTTPS is built in)"
MCP_ARN=$(create_service "$PREFIX-mcp" "$REGISTRY/claude-ready-mcp:$IMAGE_TAG" 3001 /healthz \
  '{"MCP_PORT":"3001"}' \
  "{\"MCP_READONLY_DATABASE_URL\":\"$S_RO\",\"MCP_AUDIT_DATABASE_URL\":\"$S_AU\"}")
APP_ARN=$(create_service "$PREFIX-app" "$REGISTRY/claude-ready-app:$IMAGE_TAG" 3000 /api/health \
  "{\"DEMO_MODE\":\"0\",\"AUTH_URL\":\"https://$APP_DOMAIN\",\"MCP_URL\":\"https://$MCP_DOMAIN/mcp\",\"STAGING_BASIC_AUTH\":\"$STAGING_FLAG\",\"BASIC_AUTH_USER\":\"team\",\"RUN_MIGRATIONS\":\"1\"}" \
  "{\"DATABASE_URL\":\"$S_DB\",\"MCP_READONLY_PASSWORD\":\"$S_ROPW\",\"MCP_AUDIT_PASSWORD\":\"$S_AUPW\",\"AUTH_SECRET\":\"$S_AUTH\",\"CRON_SECRET\":\"$S_CRON\",\"BASIC_AUTH_PASSWORD\":\"$S_BASIC\"}")

echo "== 7. Custom domains with automatic HTTPS certificates"
aws apprunner associate-custom-domain --service-arn "$APP_ARN" --domain-name "$APP_DOMAIN" --query 'CustomDomain.CertificateValidationRecords' --output table
aws apprunner associate-custom-domain --service-arn "$MCP_ARN" --domain-name "$MCP_DOMAIN" --query 'CustomDomain.CertificateValidationRecords' --output table

cat <<DONE

Done. Next steps (also in infra/aws/README.md):
  1. Add the DNS records printed above at your domain registrar (validation + CNAME).
  2. In GitHub > Settings > Environments > $ENV_NAME, add variables:
       APP_RUNNER_${ENV_NAME^^}_APP_ARN = $APP_ARN
       APP_RUNNER_${ENV_NAME^^}_MCP_ARN = $MCP_ARN
  3. The staging password is in Secrets Manager: $PREFIX/BASIC_AUTH_PASSWORD (user: team).
DONE
