#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -tiTCP:3000 -sTCP:LISTEN || true)"
  if [ -n "$PIDS" ]; then
    echo "Stopping existing website process on port 3000..."
    kill $PIDS
    sleep 1
  fi
fi

exec ./scripts/start-durable.sh
