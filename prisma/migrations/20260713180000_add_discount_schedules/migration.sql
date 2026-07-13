-- CreateEnum
CREATE TYPE "DiscountRecurrence" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');

-- AlterTable
ALTER TABLE "Discount" ADD COLUMN "scheduleId" INTEGER;

-- CreateTable
CREATE TABLE "DiscountSchedule" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "partyId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recurrence" "DiscountRecurrence" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastApplied" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscountSchedule_uid_key" ON "DiscountSchedule"("uid");
CREATE INDEX "DiscountSchedule_partyId_idx" ON "DiscountSchedule"("partyId");

-- AddForeignKey
ALTER TABLE "DiscountSchedule" ADD CONSTRAINT "DiscountSchedule_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "DiscountSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
