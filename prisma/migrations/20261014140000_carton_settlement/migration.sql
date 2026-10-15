-- إلغاء طريقة «النسبة الثابتة» وإضافة طريقة «بالكرتونة».
--
--   * ShareBasis: CAPITAL | CARTON بدل CAPITAL | PERCENT
--   * cartonRate على الشريك: سعر الكرتونة بالجنيه
--   * PartnerCartonEntry: إدخالات الكراتين بموافقة، وسعر مثبَّت وقت الموافقة
--   * إسقاط percent و shareOf و costSource — لم تعد تُقرأ. مصدر التكلفة دائماً
--     قوائم أسعار المورد، والحساب دائماً على أصناف المورد المحدد.
--
-- جدول Partner فارغ حالياً (حُذفت الأسماء من الشاشة)، فتحويل نوع shareBasis
-- آمن ولا يحتاج ترجمة قيم.

-- AlterEnum: ShareBasis
ALTER TABLE "Partner" ALTER COLUMN "shareBasis" DROP DEFAULT;
ALTER TABLE "Partner" ALTER COLUMN "shareBasis" TYPE TEXT;
DROP TYPE "ShareBasis";
CREATE TYPE "ShareBasis" AS ENUM ('CAPITAL', 'CARTON');
ALTER TABLE "Partner"
  ALTER COLUMN "shareBasis" TYPE "ShareBasis"
  USING (CASE WHEN "shareBasis" = 'CARTON' THEN 'CARTON' ELSE 'CAPITAL' END)::"ShareBasis";
ALTER TABLE "Partner" ALTER COLUMN "shareBasis" SET DEFAULT 'CAPITAL';

-- CreateEnum
CREATE TYPE "CartonEntryStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN "cartonRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Partner" DROP COLUMN "percent";
ALTER TABLE "Partner" DROP COLUMN "shareOf";
ALTER TABLE "Partner" DROP COLUMN "costSource";

-- DropEnum
DROP TYPE "ShareOf";
DROP TYPE "CostSource";

-- CreateTable
CREATE TABLE "PartnerCartonEntry" (
    "id"           SERIAL              NOT NULL,
    "uid"          TEXT                NOT NULL,
    "partnerId"    INTEGER             NOT NULL,
    "date"         TIMESTAMP(3)        NOT NULL,
    "cartons"      DOUBLE PRECISION    NOT NULL DEFAULT 0,
    "invoiceNo"    TEXT,
    "note"         TEXT,
    "status"       "CartonEntryStatus" NOT NULL DEFAULT 'PENDING',
    "rate"         DOUBLE PRECISION,
    "createdById"  INTEGER,
    "reviewedById" INTEGER,
    "reviewedAt"   TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)        NOT NULL,
    CONSTRAINT "PartnerCartonEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerCartonEntry_uid_key" ON "PartnerCartonEntry"("uid");
CREATE INDEX "PartnerCartonEntry_partnerId_status_idx" ON "PartnerCartonEntry"("partnerId", "status");
CREATE INDEX "PartnerCartonEntry_date_idx" ON "PartnerCartonEntry"("date");

-- AddForeignKey
ALTER TABLE "PartnerCartonEntry" ADD CONSTRAINT "PartnerCartonEntry_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerCartonEntry" ADD CONSTRAINT "PartnerCartonEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerCartonEntry" ADD CONSTRAINT "PartnerCartonEntry_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- صلاحية جديدة: إدخال الكراتين. تُمنح لحساب شريك طريقته «بالكرتونة».
-- الموافقة والرفض وسعر الكرتونة للمدير فقط.
