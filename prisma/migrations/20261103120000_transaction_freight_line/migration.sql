-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "freightInvoiceId" INTEGER,
ADD COLUMN     "freightProductId" INTEGER;

-- CreateIndex
CREATE INDEX "Transaction_freightProductId_idx" ON "Transaction"("freightProductId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_freightInvoiceId_fkey" FOREIGN KEY ("freightInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_freightProductId_fkey" FOREIGN KEY ("freightProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
