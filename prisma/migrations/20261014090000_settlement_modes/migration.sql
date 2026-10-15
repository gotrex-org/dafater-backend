-- كل حاجة في حسبة التصفية بقت إعداد لكل اسم بيتظبط من الشاشة:
--   * shareBasis  CAPITAL (داخل بفلوس) أو PERCENT (بياخد نسبة ثابتة)
--   * percent     نسبته الثابتة لما تكون PERCENT
--   * shareOf     النسبة على ربح العربية أو على إجمالي البيع
--   * costSource  سعر الشراء من قوايم الأسعار أو من متوسط سعر الشراء المحسوب
--   * suppliers   موردين متعددين (جدول PartnerSupplier) بدل مورد واحد؛
--                 مفيش أي صف = كل أصناف الفاتورة، فالاسم مش مربوط بمورد معيّن.

-- CreateEnum
CREATE TYPE "ShareBasis" AS ENUM ('CAPITAL', 'PERCENT');
CREATE TYPE "ShareOf"    AS ENUM ('PROFIT', 'SALES');
CREATE TYPE "CostSource" AS ENUM ('PRICE_LIST', 'AVG_COST');

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN "shareBasis" "ShareBasis" NOT NULL DEFAULT 'CAPITAL';
ALTER TABLE "Partner" ADD COLUMN "percent"    DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Partner" ADD COLUMN "shareOf"    "ShareOf"    NOT NULL DEFAULT 'PROFIT';
ALTER TABLE "Partner" ADD COLUMN "costSource" "CostSource" NOT NULL DEFAULT 'PRICE_LIST';
ALTER TABLE "Partner" ALTER COLUMN "cartonExpense" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "PartnerSupplier" (
    "partnerId"  INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    CONSTRAINT "PartnerSupplier_pkey" PRIMARY KEY ("partnerId", "supplierId")
);

-- CreateIndex
CREATE INDEX "PartnerSupplier_supplierId_idx" ON "PartnerSupplier"("supplierId");

-- AddForeignKey
ALTER TABLE "PartnerSupplier" ADD CONSTRAINT "PartnerSupplier_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerSupplier" ADD CONSTRAINT "PartnerSupplier_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- نقل المورد الواحد القديم للجدول الجديد، وبعدين شيل العمود
INSERT INTO "PartnerSupplier" ("partnerId", "supplierId")
SELECT id, "supplierId" FROM "Partner" WHERE "supplierId" IS NOT NULL;

DROP INDEX IF EXISTS "Partner_supplierId_idx";
ALTER TABLE "Partner" DROP CONSTRAINT IF EXISTS "Partner_supplierId_fkey";
ALTER TABLE "Partner" DROP COLUMN "supplierId";
