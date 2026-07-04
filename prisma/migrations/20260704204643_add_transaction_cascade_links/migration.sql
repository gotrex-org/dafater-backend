-- AlterTable
ALTER TABLE "DollarAgentTx" ADD COLUMN     "txId" INTEGER;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "groupId" TEXT;

-- AlterTable
ALTER TABLE "driver_payments" ADD COLUMN     "txId" INTEGER;

-- CreateIndex
CREATE INDEX "Transaction_groupId_idx" ON "Transaction"("groupId");
