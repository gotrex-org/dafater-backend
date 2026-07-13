-- CreateTable
CREATE TABLE "Discount" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "partyId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "discountId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Discount_uid_key" ON "Discount"("uid");
CREATE INDEX "Discount_partyId_idx" ON "Discount"("partyId");

-- AddForeignKey
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
