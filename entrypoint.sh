#!/bin/sh
set -e

echo "[startup] Running Prisma migrations..."
node node_modules/prisma/build/index.js migrate deploy

echo "[startup] Syncing match data from API..."
node scripts/seed.mjs || echo "[startup] Seed skipped (API unavailable)"

echo "[startup] Starting Next.js server..."
exec node server.js
