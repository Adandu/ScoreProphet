#!/bin/sh
set -e

# Fix ownership of the database file and its parent directory so the nextjs user
# can read/write it. This must run as root (before privilege drop).
if [ -n "$DATABASE_URL" ]; then
  DB_PATH=$(echo "$DATABASE_URL" | sed 's|^file:||')
  DB_DIR=$(dirname "$DB_PATH")
  mkdir -p "$DB_DIR"
  chown -R nextjs:nodejs "$DB_DIR" 2>/dev/null || true
fi

echo "[startup] Running Prisma migrations..."
su-exec nextjs node node_modules/prisma/build/index.js migrate deploy

echo "[startup] Syncing match data from API..."
su-exec nextjs node scripts/seed.mjs || echo "[startup] Seed skipped (API unavailable)"

echo "[startup] Starting head-to-head sync loop..."
(
  while true; do
    sleep 3600
    su-exec nextjs node scripts/sync-head-to-head.mjs || echo "[head-to-head-sync] Sync skipped (API unavailable)"
  done
) &

echo "[startup] Starting prediction reminder loop..."
(
  while true; do
    su-exec nextjs node scripts/send-prediction-reminders.mjs || echo "[prediction-reminders] Reminder check skipped"
    sleep 900
  done
) &

echo "[startup] Starting match statistics sync loop..."
(
  while true; do
    sleep 1800
    su-exec nextjs node scripts/sync-match-statistics.mjs || echo "[match-statistics] Sync skipped (API unavailable)"
  done
) &

echo "[startup] Starting live score sync loop..."
(
  while true; do
    sleep 10
    su-exec nextjs node scripts/sync-scores.mjs || echo "[score-sync] Sync skipped"
  done
) &

echo "[startup] Starting Next.js server..."
exec su-exec nextjs node server.js
