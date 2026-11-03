-- ترحيل أصناف التصفية الثابتة لكشف الحساب مرة واحدة (زي قيمة فاتورة)، وتثبيت قيمها.
CREATE TABLE "PartnerPosting" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "no" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartnerPosting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PartnerPosting_uid_key" ON "PartnerPosting"("uid");
CREATE UNIQUE INDEX "PartnerPosting_partnerId_no_key" ON "PartnerPosting"("partnerId", "no");
CREATE INDEX "PartnerPosting_partnerId_date_idx" ON "PartnerPosting"("partnerId", "date");
ALTER TABLE "PartnerPosting" ADD CONSTRAINT "PartnerPosting_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerPosting" ADD CONSTRAINT "PartnerPosting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerItem" ADD COLUMN "postingId" INTEGER;
ALTER TABLE "PartnerItem" ADD COLUMN "postedQty" DOUBLE PRECISION;
ALTER TABLE "PartnerItem" ADD COLUMN "postedPrice" DOUBLE PRECISION;
ALTER TABLE "PartnerItem" ADD COLUMN "postedAmount" DOUBLE PRECISION;
CREATE INDEX "PartnerItem_postingId_idx" ON "PartnerItem"("postingId");
ALTER TABLE "PartnerItem" ADD CONSTRAINT "PartnerItem_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "PartnerPosting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- الأصناف اللي كانت داخلة الكشف قبل كده (لها حركة «مستحق تصفية») بتتحط في ترحيل #1 لكل
-- اسم بنفس مستحقها، فرصيد كل اسم مايتغيّرش.
INSERT INTO "PartnerPosting" ("uid", "partnerId", "no", "date", "note")
SELECT 'pp_' || md5(pi."partnerId"::text || '-initial'), pi."partnerId", 1, date_trunc('day', now()), 'ترحيل الأصناف المسعّرة قبل الترحيل'
FROM "PartnerItem" pi JOIN "Transaction" t ON t."partnerItemId" = pi."id"
GROUP BY pi."partnerId";

UPDATE "PartnerItem" pi SET
  "postingId" = pp."id",
  "postedAmount" = t."credit" - t."debit",
  "postedQty" = COALESCE(
    (SELECT SUM(ii."qty") FROM "InvoiceItem" ii WHERE ii."invoiceId" = pi."invoiceId" AND ii."productId" = pi."productId"),
    (SELECT SUM(di."qty") FROM "DealItem" di WHERE di."dealId" = pi."dealId" AND di."productId" = pi."productId"))
FROM "Transaction" t, "PartnerPosting" pp
WHERE t."partnerItemId" = pi."id" AND pp."partnerId" = pi."partnerId" AND pp."no" = 1;
