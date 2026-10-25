#!/usr/bin/env bash
# Points an App Runner service at a new image and waits until the deploy finishes.
# Usage: infra/aws/update-service.sh <service-arn> <image-uri>
set -euo pipefail
SERVICE_ARN="$1"
IMAGE="$2"

# Keep the existing source settings (port, env vars, access role); change only the image.
SOURCE=$(aws apprunner describe-service --service-arn "$SERVICE_ARN" \
  --query 'Service.SourceConfiguration' --output json |
  jq --arg img "$IMAGE" '.ImageRepository.ImageIdentifier = $img')

OPERATION=$(aws apprunner update-service --service-arn "$SERVICE_ARN" \
  --source-configuration "$SOURCE" --query 'OperationId' --output text)
echo "Deploying $IMAGE (operation $OPERATION)"

for _ in $(seq 1 90); do
  STATUS=$(aws apprunner list-operations --service-arn "$SERVICE_ARN" \
    --query "OperationSummaryList[?Id=='$OPERATION'].Status | [0]" --output text)
  case "$STATUS" in
    SUCCEEDED) echo "Deployed."; exit 0 ;;
    FAILED|ROLLBACK_SUCCEEDED|ROLLBACK_FAILED) echo "Deploy failed: $STATUS"; exit 1 ;;
  esac
  sleep 10
done
echo "Timed out waiting for the deploy."; exit 1
