-- قسم الدفعات في كشف حساب التصفية: الدفعة تنزل من مستحق الاسم فيبان المتبقي.
-- حركة في كشف التصفية فقط — لا تمس الخزنة ولا تنشئ سطر Transaction.

CREATE TABLE "PartnerPayment" (
    "id"          SERIAL           NOT NULL,
    "uid"         TEXT             NOT NULL,
    "partnerId"   INTEGER          NOT NULL,
    "date"        TIMESTAMP(3)     NOT NULL,
    "amount"      DOUBLE PRECISION NOT NULL,
    "note"        TEXT,
    "createdById" INTEGER,
    "createdAt"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartnerPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerPayment_uid_key" ON "PartnerPayment"("uid");
CREATE INDEX "PartnerPayment_partnerId_date_idx" ON "PartnerPayment"("partnerId", "date");

ALTER TABLE "PartnerPayment" ADD CONSTRAINT "PartnerPayment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerPayment" ADD CONSTRAINT "PartnerPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
