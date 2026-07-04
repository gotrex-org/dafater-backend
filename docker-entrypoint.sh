#!/bin/sh
set -e

# Apply committed migrations if any exist; otherwise sync the schema directly
# (db push) so a fresh clone boots without a pre-generated migration.
if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo "▶ Applying Prisma migrations..."
  npx prisma migrate deploy
else
  echo "▶ No migrations found — syncing schema with db push..."
  npx prisma db push --skip-generate --accept-data-loss
fi

echo "▶ Seeding database (idempotent)..."
node dist-seed/prisma/seed.js || echo "seed skipped/failed (continuing)"

echo "▶ Starting API..."
node dist/main.js
