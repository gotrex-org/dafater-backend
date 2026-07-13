-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('INSTALLMENT', 'COLLECT', 'PAY', 'APPOINTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReminderRecurrence" AS ENUM ('MONTHLY', 'ONCE');

-- CreateTable
CREATE TABLE "Reminder" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "ReminderKind" NOT NULL DEFAULT 'OTHER',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recurrence" "ReminderRecurrence" NOT NULL DEFAULT 'MONTHLY',
    "dayOfMonth" INTEGER,
    "date" TIMESTAMP(3),
    "note" TEXT,
    "doneMonth" TEXT,
    "doneAt" TIMESTAMP(3),
    "ownerId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_uid_key" ON "Reminder"("uid");
CREATE INDEX "Reminder_ownerId_idx" ON "Reminder"("ownerId");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
