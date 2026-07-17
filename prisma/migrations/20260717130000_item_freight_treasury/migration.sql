-- كل من الناولون/الشاي على البند بيتدفع من خزينة مختارة وله بيان
ALTER TABLE "InvoiceItem" ADD COLUMN "freightTreasuryId" INTEGER;
ALTER TABLE "InvoiceItem" ADD COLUMN "freightNote" TEXT;
ALTER TABLE "InvoiceItem" ADD COLUMN "teaTreasuryId" INTEGER;
ALTER TABLE "InvoiceItem" ADD COLUMN "teaNote" TEXT;

-- CreateIndex
CREATE INDEX "InvoiceItem_freightTreasuryId_idx" ON "InvoiceItem"("freightTreasuryId");
CREATE INDEX "InvoiceItem_teaTreasuryId_idx" ON "InvoiceItem"("teaTreasuryId");

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_freightTreasuryId_fkey" FOREIGN KEY ("freightTreasuryId") REFERENCES "TreasuryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_teaTreasuryId_fkey" FOREIGN KEY ("teaTreasuryId") REFERENCES "TreasuryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
