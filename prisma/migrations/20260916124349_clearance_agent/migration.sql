-- AlterEnum
ALTER TYPE "PartyRole" ADD VALUE 'CLEARANCE';

-- AlterTable
ALTER TABLE "Manifest" ADD COLUMN     "clearingAgentId" INTEGER;

-- CreateIndex
CREATE INDEX "Manifest_clearingAgentId_idx" ON "Manifest"("clearingAgentId");

-- AddForeignKey
ALTER TABLE "Manifest" ADD CONSTRAINT "Manifest_clearingAgentId_fkey" FOREIGN KEY ("clearingAgentId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;
