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

echo "Checking database..."
if ! pnpm --filter @trenches/database exec prisma migrate status --schema=prisma/schema.prisma; then
  echo
  echo "Database check failed. If Docker is not running, start it and rerun:"
  echo "  ./scripts/activate-phase1.sh"
  exit 1
fi

echo
echo "Starting LeagueOS in durable Prisma mode..."
if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 3000 is already in use. The website is probably already running."
  echo "Open: http://localhost:3000"
  echo "To restart manually, stop the existing Terminal process with Control+C, then rerun this script."
  exit 0
fi

pnpm start
