-- تاب «تصفية»: شركاء متعددين بدل شريك واحد مثبّت.
--
-- جداول الشراكة القديمة (Arma*) بتتشال وتتبني من جديد — كانت فاضية، ومفيش
-- داتا تتهاجر. الجديد:
--   * Partner            : شريك بإسمه ورأس ماله ومورده وحسابه
--   * SupplierPriceList  : قايمة أسعار أسبوعية لكل مورد (مش قايمة واحدة عامة)
--   * PartnerVehicle     : عربية داخلة في تصفية شريك (نفس الفاتورة تنفع لأكتر من شريك)
--   * InvoiceItemWeek    : أسبوع مفروض على (فاتورة، صنف) — مش على سطر الفاتورة،
--                          لأن تعديل الفاتورة بيعيد بناء أسطرها فالربط القديم كان بيضيع.

-- DropTable
DROP TABLE IF EXISTS "ArmaPartnerItemWeek";
DROP TABLE IF EXISTS "ArmaPartnerInvoice";
DROP TABLE IF EXISTS "ArmaPriceListItem";
DROP TABLE IF EXISTS "ArmaPriceList";
DROP TABLE IF EXISTS "ArmaPartnerConfig";

-- CreateTable
CREATE TABLE "Partner" (
    "id"            SERIAL           NOT NULL,
    "uid"           TEXT             NOT NULL,
    "name"          TEXT             NOT NULL,
    "capital"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cartonExpense" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "supplierId"    INTEGER,
    "userId"        INTEGER,
    "active"        BOOLEAN          NOT NULL DEFAULT true,
    "note"          TEXT,
    "createdAt"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPriceList" (
    "id"         SERIAL       NOT NULL,
    "uid"        TEXT         NOT NULL,
    "supplierId" INTEGER      NOT NULL,
    "weekStart"  TIMESTAMP(3) NOT NULL,
    "weekEnd"    TIMESTAMP(3) NOT NULL,
    "note"       TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierPriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPriceListItem" (
    "id"          SERIAL           NOT NULL,
    "uid"         TEXT             NOT NULL,
    "priceListId" INTEGER          NOT NULL,
    "productId"   INTEGER          NOT NULL,
    "price"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "SupplierPriceListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerVehicle" (
    "id"        SERIAL           NOT NULL,
    "uid"       TEXT             NOT NULL,
    "partnerId" INTEGER          NOT NULL,
    "invoiceId" INTEGER          NOT NULL,
    "cartons"   DOUBLE PRECISION,
    "note"      TEXT,
    "createdAt" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "PartnerVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItemWeek" (
    "id"          SERIAL       NOT NULL,
    "uid"         TEXT         NOT NULL,
    "invoiceId"   INTEGER      NOT NULL,
    "productId"   INTEGER      NOT NULL,
    "priceListId" INTEGER      NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoiceItemWeek_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Partner_uid_key" ON "Partner"("uid");
CREATE UNIQUE INDEX "Partner_name_key" ON "Partner"("name");
CREATE UNIQUE INDEX "Partner_userId_key" ON "Partner"("userId");
CREATE INDEX "Partner_supplierId_idx" ON "Partner"("supplierId");
CREATE UNIQUE INDEX "SupplierPriceList_uid_key" ON "SupplierPriceList"("uid");
CREATE UNIQUE INDEX "SupplierPriceList_supplierId_weekStart_key" ON "SupplierPriceList"("supplierId", "weekStart");
CREATE UNIQUE INDEX "SupplierPriceListItem_uid_key" ON "SupplierPriceListItem"("uid");
CREATE INDEX "SupplierPriceListItem_productId_idx" ON "SupplierPriceListItem"("productId");
CREATE UNIQUE INDEX "SupplierPriceListItem_priceListId_productId_key" ON "SupplierPriceListItem"("priceListId", "productId");
CREATE UNIQUE INDEX "PartnerVehicle_uid_key" ON "PartnerVehicle"("uid");
CREATE INDEX "PartnerVehicle_invoiceId_idx" ON "PartnerVehicle"("invoiceId");
CREATE UNIQUE INDEX "PartnerVehicle_partnerId_invoiceId_key" ON "PartnerVehicle"("partnerId", "invoiceId");
CREATE UNIQUE INDEX "InvoiceItemWeek_uid_key" ON "InvoiceItemWeek"("uid");
CREATE INDEX "InvoiceItemWeek_priceListId_idx" ON "InvoiceItemWeek"("priceListId");
CREATE UNIQUE INDEX "InvoiceItemWeek_invoiceId_productId_key" ON "InvoiceItemWeek"("invoiceId", "productId");

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierPriceList" ADD CONSTRAINT "SupplierPriceList_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierPriceListItem" ADD CONSTRAINT "SupplierPriceListItem_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "SupplierPriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierPriceListItem" ADD CONSTRAINT "SupplierPriceListItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerVehicle" ADD CONSTRAINT "PartnerVehicle_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerVehicle" ADD CONSTRAINT "PartnerVehicle_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceItemWeek" ADD CONSTRAINT "InvoiceItemWeek_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceItemWeek" ADD CONSTRAINT "InvoiceItemWeek_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceItemWeek" ADD CONSTRAINT "InvoiceItemWeek_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "SupplierPriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- مفاتيح الصلاحيات اتغيّرت: mazen -> settlement، mazen.prices -> settlement.prices
UPDATE "User"
SET views = array_replace(array_replace(views, 'mazen', 'settlement'), 'mazen.prices', 'settlement.prices')
WHERE 'mazen' = ANY(views) OR 'mazen.prices' = ANY(views);
