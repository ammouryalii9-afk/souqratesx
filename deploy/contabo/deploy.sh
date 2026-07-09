#!/usr/bin/env bash
# Deploy/update script to run ON the Contabo server.
# Usage: ./deploy.sh   (run from inside the cloned repo directory)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_DIR"

echo "==> Pulling latest code from GitHub"
git fetch origin main
git reset --hard origin/main

if [ -f "deploy/contabo/.env" ]; then
  echo "==> Loading deploy/contabo/.env"
  set -a
  source deploy/contabo/.env
  set +a
else
  echo "!! deploy/contabo/.env not found. Copy .env.example to .env and fill in secrets first."
  exit 1
fi

echo "==> Installing dependencies"
corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile

echo "==> Building libs"
pnpm run typecheck:libs

echo "==> Pushing DB schema (idempotent, safe on prod-ready schema)"
pnpm --filter @workspace/db run push

echo "==> Building api-server"
pnpm --filter @workspace/api-server run build

echo "==> Building vaultx frontend"
PORT="${WEB_PORT}" BASE_PATH="/" pnpm --filter @workspace/vaultx run build

echo "==> Restarting services via pm2"
export PORT="${API_PORT}"
export NODE_ENV=production
pm2 startOrReload deploy/contabo/pm2.config.cjs --update-env

echo "==> Done. Services status:"
pm2 status
