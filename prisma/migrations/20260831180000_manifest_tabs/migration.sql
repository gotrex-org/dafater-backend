-- تابات العربيات جوّه الفاتورة:
--  • قفل تاب العربية (مين قفل وامتى) — بعد القفل ما بتشيلش مصاريف جديدة بالتاريخ.
--  • تثبيت مصروف على عربية بعينها — المصاريف اللي بتتضاف من جوّه التاب.
ALTER TABLE "Manifest" ADD COLUMN "closedAt" TIMESTAMP(3);
ALTER TABLE "Manifest" ADD COLUMN "closedBy" TEXT;

ALTER TABLE "Transaction" ADD COLUMN "manifestId" INTEGER;
CREATE INDEX "Transaction_manifestId_idx" ON "Transaction"("manifestId");
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_manifestId_fkey"
  FOREIGN KEY ("manifestId") REFERENCES "Manifest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
