-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- Mark the owner: the earliest-created admin account. Only run if no primary exists yet.
UPDATE "User"
SET "isPrimary" = true
WHERE id = (
  SELECT id FROM "User"
  WHERE admin = true
  ORDER BY "createdAt" ASC, id ASC
  LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM "User" WHERE "isPrimary" = true);
