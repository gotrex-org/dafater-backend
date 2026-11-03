-- التصفية الثابتة في حسابات البرنامج: لكل اسم حساب (Party role = PARTNER)، ورأس ماله
-- وسحبه من الخزنة، ومستحق أصنافه له — كلها حركات Transaction مربوطة بمصدرها في التصفية.
ALTER TYPE "PartyRole" ADD VALUE 'PARTNER';

ALTER TABLE "Partner" ADD COLUMN "partyId" INTEGER;
CREATE UNIQUE INDEX "Partner_partyId_key" ON "Partner"("partyId");
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerCapitalMovement" ADD COLUMN "treasuryId" INTEGER;
ALTER TABLE "PartnerCapitalMovement" ADD CONSTRAINT "PartnerCapitalMovement_treasuryId_fkey" FOREIGN KEY ("treasuryId") REFERENCES "TreasuryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerPayment" ADD COLUMN "treasuryId" INTEGER;
ALTER TABLE "PartnerPayment" ADD CONSTRAINT "PartnerPayment_treasuryId_fkey" FOREIGN KEY ("treasuryId") REFERENCES "TreasuryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Transaction" ADD COLUMN "partnerItemId" INTEGER;
ALTER TABLE "Transaction" ADD COLUMN "partnerCapitalId" INTEGER;
ALTER TABLE "Transaction" ADD COLUMN "partnerPaymentId" INTEGER;
CREATE UNIQUE INDEX "Transaction_partnerItemId_key" ON "Transaction"("partnerItemId");
CREATE UNIQUE INDEX "Transaction_partnerCapitalId_key" ON "Transaction"("partnerCapitalId");
CREATE UNIQUE INDEX "Transaction_partnerPaymentId_key" ON "Transaction"("partnerPaymentId");
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_partnerItemId_fkey" FOREIGN KEY ("partnerItemId") REFERENCES "PartnerItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_partnerCapitalId_fkey" FOREIGN KEY ("partnerCapitalId") REFERENCES "PartnerCapitalMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_partnerPaymentId_fkey" FOREIGN KEY ("partnerPaymentId") REFERENCES "PartnerPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
