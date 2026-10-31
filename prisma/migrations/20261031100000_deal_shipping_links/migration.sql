-- البيع الخارجي زي الفواتير: بنود شحن، وربط بكشوفات العربيات ورحلات السواقين،
-- وسعر صرف للمورد الدولاري.

ALTER TABLE "Deal" ADD COLUMN "exchangeRate" DOUBLE PRECISION;

CREATE TABLE "DealCharge" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "dealId" INTEGER NOT NULL,
    "chargeTypeId" INTEGER NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "price" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "manifestId" INTEGER,

    CONSTRAINT "DealCharge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DealCharge_uid_key" ON "DealCharge"("uid");
CREATE INDEX "DealCharge_dealId_idx" ON "DealCharge"("dealId");
CREATE INDEX "DealCharge_manifestId_idx" ON "DealCharge"("manifestId");

ALTER TABLE "DealCharge" ADD CONSTRAINT "DealCharge_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealCharge" ADD CONSTRAINT "DealCharge_chargeTypeId_fkey" FOREIGN KEY ("chargeTypeId") REFERENCES "ChargeType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DealCharge" ADD CONSTRAINT "DealCharge_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "Manifest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Manifest" ADD COLUMN "dealId" INTEGER;
CREATE INDEX "Manifest_dealId_idx" ON "Manifest"("dealId");
ALTER TABLE "Manifest" ADD CONSTRAINT "Manifest_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "driver_trips" ADD COLUMN "dealId" INTEGER;
CREATE UNIQUE INDEX "driver_trips_dealId_key" ON "driver_trips"("dealId");
ALTER TABLE "driver_trips" ADD CONSTRAINT "driver_trips_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
