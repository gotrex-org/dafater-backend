-- التصفية برأس المال في حسابات البرنامج كمان: نصيب الاسم من كل فاتورة مختارة حركة في حسابه.
ALTER TABLE "Transaction" ADD COLUMN "partnerVehicleId" INTEGER;
CREATE UNIQUE INDEX "Transaction_partnerVehicleId_key" ON "Transaction"("partnerVehicleId");
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_partnerVehicleId_fkey" FOREIGN KEY ("partnerVehicleId") REFERENCES "PartnerVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
