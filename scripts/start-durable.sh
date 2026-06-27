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

export REPOSITORY_ADAPTER=prisma
export DEMO_MODE=false

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is missing from .env."
  exit 1
fi

if ! nc -z localhost 5432 >/dev/null 2>&1 && ! nc -z 127.0.0.1 5432 >/dev/null 2>&1; then
  echo "Postgres is not running. Starting the Docker database services..."
  if ! docker compose up -d postgres redis; then
    echo
    echo "Docker could not start the database services."
    echo "Open Docker Desktop, wait until it says Docker is running, then rerun this script."
    exit 1
  fi

  echo "Waiting for Postgres on localhost:5432..."
  for attempt in {1..30}; do
    if nc -z localhost 5432 >/dev/null 2>&1 || nc -z 127.0.0.1 5432 >/dev/null 2>&1; then
      break
    fi
    if [ "$attempt" -eq 30 ]; then
      echo "Postgres did not become reachable on localhost:5432."
      echo "Check Docker Desktop, then rerun this script."
      exit 1
    fi
    sleep 2
  done
fi

echo "Refreshing database client..."
pnpm db:generate

echo "Checking database..."
if ! pnpm --filter @trenches/database exec prisma migrate status --schema=prisma/schema.prisma; then
  echo
  echo "Database check failed. If Docker is not running, start it and rerun:"
  echo "  ./scripts/activate-phase1.sh"
  exit 1
fi

echo "Ensuring all 32 foundation teams are available..."
pnpm db:seed

echo
echo "Starting LeagueOS in durable Prisma mode..."
if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 3000 is already in use. Checking whether the running website is current..."
  echo
  if API_BASE_URL="http://127.0.0.1:3000" pnpm verify:runtime; then
    echo
    echo "The running website is current."
    echo "Open: http://localhost:3000"
    exit 0
  fi

  echo
  echo "The running website is outdated or unhealthy."
  echo "Restart it with:"
  echo "  ./scripts/restart-durable.sh"
  exit 1
fi

pnpm start
