-- البند الثابت ممكن يبقى على الشركة عمومًا (مخزن اختياري)
ALTER TABLE "WarehouseExpenseSchedule" DROP CONSTRAINT "WarehouseExpenseSchedule_warehouseId_fkey";
ALTER TABLE "WarehouseExpenseSchedule" ALTER COLUMN "warehouseId" DROP NOT NULL;
ALTER TABLE "WarehouseExpenseSchedule" ADD CONSTRAINT "WarehouseExpenseSchedule_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
