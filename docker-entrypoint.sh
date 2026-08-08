#!/bin/sh
set -e

echo "▶ Applying Prisma migrations..."
# Baseline: if the DB already has tables but no _prisma_migrations table
# (bootstrapped via db push), mark the init migration as applied so
# prisma migrate deploy doesn't try to re-run its CREATE TABLE statements.
npx prisma migrate resolve --applied "20260704000000_init" 2>/dev/null || true

# Self-heal: on a healthy DB `migrate deploy` succeeds first time (constraints included).
# But if it fails — most likely the audit unique-constraints migration hitting pre-existing
# duplicate invoice/deal numbers on a live DB — mark that (enhancement-only) migration as
# applied so the API can boot instead of crash-looping, then retry. The unique constraints
# can be added by hand after de-duplicating. The `if !` keeps `set -e` from exiting here.
if ! npx prisma migrate deploy; then
  echo "⚠ migrate deploy failed — resolving audit unique-constraints migration and retrying..."
  npx prisma migrate resolve --applied "20260725120000_audit_unique_constraints" 2>/dev/null || true
  npx prisma migrate deploy
fi

echo "▶ Seeding database (idempotent)..."
node dist-seed/prisma/seed.js || echo "seed skipped/failed (continuing)"

echo "▶ Starting API..."
node dist/main.js
