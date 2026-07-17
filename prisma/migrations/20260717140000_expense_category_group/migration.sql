-- CreateEnum
CREATE TYPE "ExpenseGroup" AS ENUM ('WAREHOUSE', 'EXTERNAL');

-- AlterTable: البند تحت مجموعة رئيسية (مصاريف مخزن / مصاريف خارجية)
ALTER TABLE "ExpenseCategory" ADD COLUMN "group" "ExpenseGroup" NOT NULL DEFAULT 'WAREHOUSE';
