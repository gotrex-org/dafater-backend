-- CreateTable: استحقاقات بنود المخزن الثابتة (بدل الخصم التلقائي)
CREATE TABLE "WarehouseExpenseDue" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "scheduleId" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseExpenseDue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseExpenseDue_uid_key" ON "WarehouseExpenseDue"("uid");
CREATE INDEX "WarehouseExpenseDue_paid_idx" ON "WarehouseExpenseDue"("paid");
CREATE UNIQUE INDEX "WarehouseExpenseDue_scheduleId_period_key" ON "WarehouseExpenseDue"("scheduleId", "period");

-- AddForeignKey
ALTER TABLE "WarehouseExpenseDue" ADD CONSTRAINT "WarehouseExpenseDue_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "WarehouseExpenseSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
