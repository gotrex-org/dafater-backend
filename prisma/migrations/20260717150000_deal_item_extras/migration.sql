-- تكاليف إضافية على بند البيع الخارجي (ناولون خارجي/شاي/عمولة بخزنة وبيان) زي الفواتير
ALTER TABLE "DealItem" ADD COLUMN "freight" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "DealItem" ADD COLUMN "tea" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "DealItem" ADD COLUMN "freightTreasuryId" INTEGER;
ALTER TABLE "DealItem" ADD COLUMN "freightNote" TEXT;
ALTER TABLE "DealItem" ADD COLUMN "teaTreasuryId" INTEGER;
ALTER TABLE "DealItem" ADD COLUMN "teaNote" TEXT;
ALTER TABLE "DealItem" ADD COLUMN "commission" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "DealItem" ADD COLUMN "commissionQty" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "DealItem" ADD COLUMN "commissionPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "DealItem" ADD COLUMN "commissionPartyId" INTEGER;

-- CreateIndex
CREATE INDEX "DealItem_commissionPartyId_idx" ON "DealItem"("commissionPartyId");

-- AddForeignKey
ALTER TABLE "DealItem" ADD CONSTRAINT "DealItem_freightTreasuryId_fkey" FOREIGN KEY ("freightTreasuryId") REFERENCES "TreasuryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DealItem" ADD CONSTRAINT "DealItem_teaTreasuryId_fkey" FOREIGN KEY ("teaTreasuryId") REFERENCES "TreasuryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DealItem" ADD CONSTRAINT "DealItem_commissionPartyId_fkey" FOREIGN KEY ("commissionPartyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;
