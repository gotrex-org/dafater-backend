-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "warehouseId" INTEGER;

-- CreateTable
CREATE TABLE "WarehouseExpenseSchedule" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "treasuryId" INTEGER,
    "categoryId" INTEGER,
    "title" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastApplied" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseExpenseSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseExpenseSchedule_uid_key" ON "WarehouseExpenseSchedule"("uid");
CREATE INDEX "WarehouseExpenseSchedule_warehouseId_idx" ON "WarehouseExpenseSchedule"("warehouseId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WarehouseExpenseSchedule" ADD CONSTRAINT "WarehouseExpenseSchedule_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WarehouseExpenseSchedule" ADD CONSTRAINT "WarehouseExpenseSchedule_treasuryId_fkey" FOREIGN KEY ("treasuryId") REFERENCES "TreasuryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WarehouseExpenseSchedule" ADD CONSTRAINT "WarehouseExpenseSchedule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
