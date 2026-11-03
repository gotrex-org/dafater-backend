-- أصناف التصفية الثابتة من البيع الخارجي كمان: الصنف من فاتورة شراء أو من بيع خارجي.
ALTER TABLE "PartnerItem" ALTER COLUMN "invoiceId" DROP NOT NULL;
ALTER TABLE "PartnerItem" ADD COLUMN "dealId" INTEGER;
CREATE UNIQUE INDEX "PartnerItem_partnerId_dealId_productId_key" ON "PartnerItem"("partnerId", "dealId", "productId");
CREATE INDEX "PartnerItem_dealId_idx" ON "PartnerItem"("dealId");
ALTER TABLE "PartnerItem" ADD CONSTRAINT "PartnerItem_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
