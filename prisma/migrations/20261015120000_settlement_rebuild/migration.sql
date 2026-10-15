-- إعادة بناء التصفية: طريقتان فقط — برأس المال، أو تصفية ثابتة (مبلغ لكل وحدة).
--
--   * ShareBasis: CARTON صارت FIXED
--   * إدخالات الكراتين اليدوية أُلغيت — التصفية الثابتة تمشي على فواتير شراء
--     مختارة، ولكل فاتورة مبلغها للوحدة في PartnerVehicle.rate
--   * PartnerCapitalMovement: إضافة أو نقص رأس مال على القديم، بتاريخ وسجل

-- AlterEnum: CARTON -> FIXED
ALTER TABLE "Partner" ALTER COLUMN "shareBasis" DROP DEFAULT;
ALTER TABLE "Partner" ALTER COLUMN "shareBasis" TYPE TEXT;
DROP TYPE "ShareBasis";
CREATE TYPE "ShareBasis" AS ENUM ('CAPITAL', 'FIXED');
ALTER TABLE "Partner"
  ALTER COLUMN "shareBasis" TYPE "ShareBasis"
  USING (CASE WHEN "shareBasis" IN ('CARTON', 'FIXED') THEN 'FIXED' ELSE 'CAPITAL' END)::"ShareBasis";
ALTER TABLE "Partner" ALTER COLUMN "shareBasis" SET DEFAULT 'CAPITAL';

-- DropTable: إدخالات الكراتين اليدوية
DROP TABLE IF EXISTS "PartnerCartonEntry";
DROP TYPE IF EXISTS "CartonEntryStatus";

-- AlterTable: المبلغ للوحدة على الفاتورة المختارة (تصفية ثابتة)
ALTER TABLE "PartnerVehicle" ADD COLUMN "rate" DOUBLE PRECISION;

-- CreateTable: حركات رأس المال
CREATE TABLE "PartnerCapitalMovement" (
    "id"          SERIAL           NOT NULL,
    "uid"         TEXT             NOT NULL,
    "partnerId"   INTEGER          NOT NULL,
    "date"        TIMESTAMP(3)     NOT NULL,
    "amount"      DOUBLE PRECISION NOT NULL,
    "note"        TEXT,
    "createdById" INTEGER,
    "createdAt"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartnerCapitalMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerCapitalMovement_uid_key" ON "PartnerCapitalMovement"("uid");
CREATE INDEX "PartnerCapitalMovement_partnerId_date_idx" ON "PartnerCapitalMovement"("partnerId", "date");

-- AddForeignKey
ALTER TABLE "PartnerCapitalMovement" ADD CONSTRAINT "PartnerCapitalMovement_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerCapitalMovement" ADD CONSTRAINT "PartnerCapitalMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
