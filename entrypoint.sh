#!/bin/sh
set -e

echo "[startup] Running Prisma migrations..."
node node_modules/prisma/build/index.js migrate deploy

echo "[startup] Syncing match data from API..."
node scripts/seed.mjs || echo "[startup] Seed skipped (API unavailable)"

echo "[startup] Starting head-to-head sync loop..."
(
  while true; do
    sleep 60
    node scripts/sync-head-to-head.mjs || echo "[head-to-head-sync] Sync skipped (API unavailable)"
  done
) &

echo "[startup] Starting prediction reminder loop..."
(
  while true; do
    node scripts/send-prediction-reminders.mjs || echo "[prediction-reminders] Reminder check skipped"
    sleep 900
  done
) &

echo "[startup] Starting Next.js server..."
exec node server.js
