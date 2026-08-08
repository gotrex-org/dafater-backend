-- سلف السائق (مستقلة عن الرحلة)
CREATE TABLE "driver_advances" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "txId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_advances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "driver_advances_uid_key" ON "driver_advances"("uid");
CREATE INDEX "driver_advances_driverName_idx" ON "driver_advances"("driverName");
