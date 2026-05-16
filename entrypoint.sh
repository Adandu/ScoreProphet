#!/bin/sh
set -e

echo "[startup] Running Prisma migrations..."
node node_modules/prisma/build/index.js migrate deploy

echo "[startup] Syncing match data from API..."
node scripts/seed.mjs || echo "[startup] Seed skipped (API unavailable)"

echo "[startup] Starting head-to-head sync loop..."
(
  while true; do
    sleep 3600
    node scripts/sync-head-to-head.mjs || echo "[head-to-head-sync] Sync skipped (API unavailable)"
  done
) &

echo "[startup] Starting prediction reminder loop..."
(
  while true; do
    node_modules/.bin/tsx scripts/send-prediction-reminders.ts || echo "[prediction-reminders] Reminder check skipped"
    sleep 900
  done
) &

echo "[startup] Starting match statistics sync loop..."
(
  while true; do
    sleep 1800
    node scripts/sync-match-statistics.mjs || echo "[match-statistics] Sync skipped (API unavailable)"
  done
) &

echo "[startup] Starting Next.js server..."
exec node server.js
