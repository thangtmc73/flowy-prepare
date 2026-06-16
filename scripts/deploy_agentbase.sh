#!/usr/bin/env bash
# Build, push, and update AgentBase runtime for CI or manual deploy.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

SCRIPTS=".claude/skills/agentbase/scripts"
ENV_FILE="${AGENTBASE_ENV_FILE:-.env.deploy}"

require_cmd() {
  for cmd in "$@"; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      echo "ERROR: '$cmd' is required but not installed." >&2
      exit 1
    fi
  done
}

require_cmd python3 jq curl docker bash

if [ -z "${GREENNODE_CLIENT_ID:-}" ] || [ -z "${GREENNODE_CLIENT_SECRET:-}" ]; then
  echo "ERROR: GREENNODE_CLIENT_ID and GREENNODE_CLIENT_SECRET must be set." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: Runtime env file not found: $ENV_FILE" >&2
  exit 1
fi

CONFIG_FILE="${AGENTBASE_CONFIG_FILE:-}"
if [ -z "$CONFIG_FILE" ]; then
  if [ -f "agentbase.config.json" ]; then
    CONFIG_FILE="agentbase.config.json"
  elif [ -f "agentbase.config.example.json" ]; then
    CONFIG_FILE="agentbase.config.example.json"
  fi
fi

if [ -z "$CONFIG_FILE" ] || [ ! -f "$CONFIG_FILE" ]; then
  if [ -z "${AGENTBASE_RUNTIME_ID:-}" ] || [ -z "${AGENTBASE_IMAGE_NAME:-}" ] || [ -z "${AGENTBASE_FLAVOR:-}" ]; then
    echo "ERROR: Provide agentbase.config.json or set AGENTBASE_RUNTIME_ID, AGENTBASE_IMAGE_NAME, AGENTBASE_FLAVOR." >&2
    exit 1
  fi
fi

RUNTIME_ID="${AGENTBASE_RUNTIME_ID:-}"
IMAGE_NAME="${AGENTBASE_IMAGE_NAME:-}"
FLAVOR="${AGENTBASE_FLAVOR:-}"
DESCRIPTION="${AGENTBASE_DESCRIPTION:-}"

if [ -n "$CONFIG_FILE" ] && [ -f "$CONFIG_FILE" ]; then
  if [ -z "$RUNTIME_ID" ]; then
    RUNTIME_ID="$(jq -r '.runtime_id // empty' "$CONFIG_FILE")"
  fi
  if [ -z "$IMAGE_NAME" ]; then
    IMAGE_NAME="$(jq -r '.image_name // empty' "$CONFIG_FILE")"
  fi
  if [ -z "$FLAVOR" ]; then
    FLAVOR="$(jq -r '.flavor // empty' "$CONFIG_FILE")"
  fi
  if [ -z "$DESCRIPTION" ]; then
    DESCRIPTION="$(jq -r '.description // empty' "$CONFIG_FILE")"
  fi
fi

if [ -z "$RUNTIME_ID" ] || [ -z "$IMAGE_NAME" ] || [ -z "$FLAVOR" ]; then
  echo "ERROR: runtime_id, image_name, and flavor are required." >&2
  exit 1
fi

echo "==> Validating knowledge base"
python3 scripts/validate_knowledge.py

echo "==> Fetching Container Registry info"
REPO_JSON="$(bash "$SCRIPTS/cr.sh" repo get)"
REGISTRY="$(echo "$REPO_JSON" | jq -r '.registryUrl // empty')"
REPO_NAME="$(echo "$REPO_JSON" | jq -r '.name // empty')"

if [ -z "$REGISTRY" ] || [ -z "$REPO_NAME" ]; then
  echo "ERROR: Could not read registryUrl/name from CR repository response." >&2
  exit 1
fi

TAG="${IMAGE_TAG:-v$(date -u +%Y%m%d%H%M%S)}"
IMAGE_URL="${REGISTRY}/${REPO_NAME}/${IMAGE_NAME}:${TAG}"

echo "==> Logging in to AgentBase Container Registry"
bash "$SCRIPTS/cr.sh" credentials docker-login

SITE_URL="${VITE_SITE_URL:-}"

echo "==> Building Docker image: $IMAGE_URL"
BUILD_ARGS=(--platform linux/amd64 -t "$IMAGE_URL" .)
if [ -n "$SITE_URL" ]; then
  BUILD_ARGS=(--platform linux/amd64 --build-arg "VITE_SITE_URL=${SITE_URL}" -t "$IMAGE_URL" .)
fi
docker build "${BUILD_ARGS[@]}"

echo "==> Pushing Docker image"
docker push "$IMAGE_URL"

UPDATE_ARGS=(
  update "$RUNTIME_ID"
  --image "$IMAGE_URL"
  --flavor "$FLAVOR"
  --env-file "$ENV_FILE"
  --from-cr
  --min-replicas 1
  --max-replicas 1
  --cpu-scale 50
  --mem-scale 50
)

if [ -n "$DESCRIPTION" ]; then
  UPDATE_ARGS+=(--description "$DESCRIPTION")
fi

echo "==> Updating AgentBase runtime: $RUNTIME_ID"
bash "$SCRIPTS/runtime.sh" "${UPDATE_ARGS[@]}"

echo "Deploy complete."
echo "Image: $IMAGE_URL"
echo "Runtime: $RUNTIME_ID"
