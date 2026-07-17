-- AlterTable: تكاليف إضافية على بند الفاتورة (شاي + عمولة بعدد/سعر/صاحبها)
ALTER TABLE "InvoiceItem" ADD COLUMN "tea" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceItem" ADD COLUMN "commissionQty" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceItem" ADD COLUMN "commissionPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceItem" ADD COLUMN "commissionPartyId" INTEGER;

-- CreateIndex
CREATE INDEX "InvoiceItem_commissionPartyId_idx" ON "InvoiceItem"("commissionPartyId");

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_commissionPartyId_fkey" FOREIGN KEY ("commissionPartyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;
