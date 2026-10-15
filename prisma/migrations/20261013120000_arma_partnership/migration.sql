-- شراكة مازن على أصناف ارما: قوايم أسعار أسبوعية + تعليم العربيات + إعدادات الشراكة.

-- CreateTable
CREATE TABLE "ArmaPriceList" (
    "id"        SERIAL           NOT NULL,
    "uid"       TEXT             NOT NULL,
    "weekStart" TIMESTAMP(3)     NOT NULL,
    "note"      TEXT,
    "createdAt" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "ArmaPriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArmaPriceListItem" (
    "id"          SERIAL           NOT NULL,
    "uid"         TEXT             NOT NULL,
    "priceListId" INTEGER          NOT NULL,
    "productId"   INTEGER          NOT NULL,
    "price"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "ArmaPriceListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArmaPartnerInvoice" (
    "id"        SERIAL           NOT NULL,
    "uid"       TEXT             NOT NULL,
    "invoiceId" INTEGER          NOT NULL,
    "cartons"   DOUBLE PRECISION,
    "note"      TEXT,
    "createdAt" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "ArmaPartnerInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArmaPartnerItemWeek" (
    "id"            SERIAL       NOT NULL,
    "uid"           TEXT         NOT NULL,
    "invoiceItemId" INTEGER      NOT NULL,
    "priceListId"   INTEGER      NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArmaPartnerItemWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArmaPartnerConfig" (
    "id"            INTEGER          NOT NULL DEFAULT 1,
    "partnerName"   TEXT             NOT NULL DEFAULT 'مازن',
    "capital"       DOUBLE PRECISION NOT NULL DEFAULT 380000,
    "cartonExpense" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "armaPartyId"   INTEGER,
    "updatedAt"     TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "ArmaPartnerConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArmaPriceList_uid_key" ON "ArmaPriceList"("uid");
CREATE UNIQUE INDEX "ArmaPriceList_weekStart_key" ON "ArmaPriceList"("weekStart");
CREATE UNIQUE INDEX "ArmaPriceListItem_uid_key" ON "ArmaPriceListItem"("uid");
CREATE INDEX "ArmaPriceListItem_productId_idx" ON "ArmaPriceListItem"("productId");
CREATE UNIQUE INDEX "ArmaPriceListItem_priceListId_productId_key" ON "ArmaPriceListItem"("priceListId", "productId");
CREATE UNIQUE INDEX "ArmaPartnerInvoice_uid_key" ON "ArmaPartnerInvoice"("uid");
CREATE UNIQUE INDEX "ArmaPartnerInvoice_invoiceId_key" ON "ArmaPartnerInvoice"("invoiceId");
CREATE UNIQUE INDEX "ArmaPartnerItemWeek_uid_key" ON "ArmaPartnerItemWeek"("uid");
CREATE UNIQUE INDEX "ArmaPartnerItemWeek_invoiceItemId_key" ON "ArmaPartnerItemWeek"("invoiceItemId");
CREATE INDEX "ArmaPartnerItemWeek_priceListId_idx" ON "ArmaPartnerItemWeek"("priceListId");

-- AddForeignKey
ALTER TABLE "ArmaPriceListItem" ADD CONSTRAINT "ArmaPriceListItem_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "ArmaPriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArmaPriceListItem" ADD CONSTRAINT "ArmaPriceListItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ArmaPartnerInvoice" ADD CONSTRAINT "ArmaPartnerInvoice_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArmaPartnerItemWeek" ADD CONSTRAINT "ArmaPartnerItemWeek_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "InvoiceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArmaPartnerItemWeek" ADD CONSTRAINT "ArmaPartnerItemWeek_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "ArmaPriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArmaPartnerConfig" ADD CONSTRAINT "ArmaPartnerConfig_armaPartyId_fkey" FOREIGN KEY ("armaPartyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;
