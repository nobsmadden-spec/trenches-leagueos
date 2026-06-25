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

pnpm bot:diagnose-env
pnpm bot:start
