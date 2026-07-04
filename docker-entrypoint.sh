#!/bin/sh
set -e

echo "▶ Applying Prisma migrations..."
# Baseline: if the DB already has tables but no _prisma_migrations table
# (bootstrapped via db push), mark the init migration as applied so
# prisma migrate deploy doesn't try to re-run its CREATE TABLE statements.
npx prisma migrate resolve --applied "20260704000000_init" 2>/dev/null || true
npx prisma migrate deploy

echo "▶ Seeding database (idempotent)..."
node dist-seed/prisma/seed.js || echo "seed skipped/failed (continuing)"

echo "▶ Starting API..."
node dist/main.js
