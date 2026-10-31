#!/usr/bin/env bash
# Build Dockerfile.backend, push it to the Lightsail container service and roll it out.
# Needs: docker, aws CLI (logged in), lightsailctl on PATH, the admin token in $TOKEN_FILE.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGION="${AWS_REGION:-ap-south-1}"
SERVICE="${LIGHTSAIL_SERVICE:-luminar}"
TOKEN_FILE="${TOKEN_FILE:-$HOME/.config/luminar/admin-token}"
TAG="luminar-be:$(git -C "$ROOT" rev-parse --short HEAD)"

[[ -s "$TOKEN_FILE" ]] || { echo "no admin token at $TOKEN_FILE (openssl rand -hex 32 > it)" >&2; exit 1; }

docker build -f "$ROOT/Dockerfile.backend" -t "$TAG" "$ROOT"
IMAGE=$(aws lightsail push-container-image --region "$REGION" --service-name "$SERVICE" \
  --label backend --image "$TAG" | grep -oE ':[a-z0-9.-]+\.backend\.[0-9]+' | tail -1)
echo "pushed $TAG as $IMAGE"

TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT
python3 - "$TMP" "$IMAGE" "$TOKEN_FILE" <<'EOF'
import json, sys
out, image, token_file = sys.argv[1:]
json.dump({"luminar": {"image": image, "ports": {"8080": "HTTP"}, "environment": {
    "PORT": "8080", "LUMINAR_NODE_COUNT": "20", "LUMINAR_LOG_LEVEL": "INFO",
    "LUMINAR_ADMIN_TOKEN": open(token_file).read().strip()}}}, open(out, "w"))
EOF

aws lightsail create-container-service-deployment --region "$REGION" --service-name "$SERVICE" \
  --containers "file://$TMP" \
  --public-endpoint '{"containerName":"luminar","containerPort":8080,"healthCheck":{"path":"/api/sim/snapshot","intervalSeconds":10,"timeoutSeconds":5,"healthyThreshold":2,"unhealthyThreshold":3,"successCodes":"200"}}' \
  --query 'containerService.nextDeployment.state' --output text
echo "rolling out; watch: aws lightsail get-container-services --region $REGION --service-name $SERVICE --query 'containerServices[0].currentDeployment.state'"
