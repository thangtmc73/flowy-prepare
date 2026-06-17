#!/bin/sh
set -e
mkdir -p data/sessions data/jobs
AGENT_PORT="${AGENT_PORT:-8081}"
uvicorn main:app --host 0.0.0.0 --port "$AGENT_PORT" &
nginx -g "daemon off;"
