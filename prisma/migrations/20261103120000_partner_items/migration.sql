-- التصفية الثابتة بقت على مستوى الصنف: (فاتورة شراء، صنف) بدل الفاتورة كلها.
CREATE TABLE "PartnerItem" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "rate" DOUBLE PRECISION,
    "percent" DOUBLE PRECISION,
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PartnerItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerItem_uid_key" ON "PartnerItem"("uid");
CREATE UNIQUE INDEX "PartnerItem_partnerId_invoiceId_productId_key" ON "PartnerItem"("partnerId", "invoiceId", "productId");
CREATE INDEX "PartnerItem_invoiceId_idx" ON "PartnerItem"("invoiceId");

ALTER TABLE "PartnerItem" ADD CONSTRAINT "PartnerItem_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerItem" ADD CONSTRAINT "PartnerItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerItem" ADD CONSTRAINT "PartnerItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- فواتير الشراء المختارة قبل كده لأسماء التصفية الثابتة: كل صنف (غير خدمي) فيها
-- بيبقى صنف مختار بنفس المبلغ للوحدة والنسبة والموافقة.
INSERT INTO "PartnerItem" ("uid", "partnerId", "invoiceId", "productId", "rate", "percent", "approved", "updatedAt")
SELECT DISTINCT ON (pv."partnerId", pv."invoiceId", it."productId")
  'pi_' || md5(pv."partnerId"::text || '-' || pv."invoiceId"::text || '-' || it."productId"::text),
  pv."partnerId", pv."invoiceId", it."productId", pv."rate", pv."percent", pv."approved", CURRENT_TIMESTAMP
FROM "PartnerVehicle" pv
JOIN "Partner" p ON p."id" = pv."partnerId" AND p."shareBasis" = 'FIXED'
JOIN "Invoice" i ON i."id" = pv."invoiceId" AND i."kind" = 'PURCHASE'
JOIN "InvoiceItem" it ON it."invoiceId" = i."id"
JOIN "Product" pr ON pr."id" = it."productId" AND pr."service" = false;

-- النسبة والموافقة كانت على الفاتورة كلها لفترة قصيرة — مكانها دلوقتي PartnerItem
ALTER TABLE "PartnerVehicle" DROP COLUMN "percent";
ALTER TABLE "PartnerVehicle" DROP COLUMN "approved";
