-- CreateEnum
CREATE TYPE "OwnerEntryKind" AS ENUM ('PERSONAL_EXPENSE', 'COMPANY_PAYMENT', 'CLIENT_PAYMENT');

-- CreateTable
CREATE TABLE "OwnerEntry" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "kind" "OwnerEntryKind" NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "ownerId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OwnerEntry_uid_key" ON "OwnerEntry"("uid");
CREATE INDEX "OwnerEntry_ownerId_idx" ON "OwnerEntry"("ownerId");

-- AddForeignKey
ALTER TABLE "OwnerEntry" ADD CONSTRAINT "OwnerEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
