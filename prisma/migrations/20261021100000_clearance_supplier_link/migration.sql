-- ربط مكتب التخليص بمورد: التخليص والدفعات الجديدة تُرحَّل على حساب المورد،
-- والمكتب يبقى اسماً على الحركة. الحركات القديمة كما هي.

ALTER TABLE "Party" ADD COLUMN "clearanceSupplierId" INTEGER;
ALTER TABLE "Party" ADD CONSTRAINT "Party_clearanceSupplierId_fkey" FOREIGN KEY ("clearanceSupplierId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Transaction" ADD COLUMN "clearanceAgentId" INTEGER;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_clearanceAgentId_fkey" FOREIGN KEY ("clearanceAgentId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Transaction_clearanceAgentId_idx" ON "Transaction"("clearanceAgentId");

-- الحركات القديمة: صاحبها هو المكتب نفسه.
UPDATE "Transaction" t SET "clearanceAgentId" = t."partyId"
FROM "Party" p
WHERE p."id" = t."partyId" AND p."role" = 'CLEARANCE'
  AND t."type" IN ('جمارك', 'سداد مخلّص');
