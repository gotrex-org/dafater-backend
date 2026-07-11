-- CreateTable
CREATE TABLE "Return" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "kind" "InvoiceKind" NOT NULL,
    "no" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "partyId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "invoiceId" INTEGER,
    "refund" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "treasuryId" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Return_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnItem" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "returnId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ReturnItem_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "returnId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Return_uid_key" ON "Return"("uid");
CREATE INDEX "Return_kind_idx" ON "Return"("kind");
CREATE INDEX "Return_partyId_idx" ON "Return"("partyId");
CREATE UNIQUE INDEX "ReturnItem_uid_key" ON "ReturnItem"("uid");
CREATE INDEX "ReturnItem_returnId_idx" ON "ReturnItem"("returnId");

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Return" ADD CONSTRAINT "Return_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Return" ADD CONSTRAINT "Return_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Return" ADD CONSTRAINT "Return_treasuryId_fkey" FOREIGN KEY ("treasuryId") REFERENCES "TreasuryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE CASCADE ON UPDATE CASCADE;
