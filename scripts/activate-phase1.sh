#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BUNDLED_NODE="/Users/devinames/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
BUNDLED_BIN="/Users/devinames/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin"
if [ -d "$BUNDLED_NODE" ]; then
  export PATH="$BUNDLED_NODE:$BUNDLED_BIN:$PATH"
fi

if [ ! -f ".env" ]; then
  echo "Missing .env. Create it first, then rerun this script."
  exit 1
fi

set -a
source ".env"
set +a

echo "Starting Docker database services..."
docker compose up -d

echo "Waiting for Postgres on localhost:5432..."
for attempt in {1..30}; do
  if nc -z localhost 5432 >/dev/null 2>&1 || nc -z 127.0.0.1 5432 >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "Postgres did not become reachable on localhost:5432."
    echo "Run: docker compose ps"
    echo "Then: docker compose logs postgres --tail=80"
    exit 1
  fi
  sleep 2
done

echo "Applying database migration..."
pnpm db:deploy

echo "Seeding league data..."
pnpm db:seed

echo
echo "Phase 1 database activation is ready."
echo "Start durable mode with:"
echo "  REPOSITORY_ADAPTER=prisma DEMO_MODE=false pnpm start"
