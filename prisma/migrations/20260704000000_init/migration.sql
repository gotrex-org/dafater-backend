-- ============================================================
-- Init migration — baseline of the full schema at 2026-07-04
-- The production database was bootstrapped via `prisma db push`
-- (no _prisma_migrations table). On existing servers, docker-
-- entrypoint.sh marks this migration as already applied so
-- these CREATE statements are never executed. On a brand-new
-- database they create every table from scratch.
-- ============================================================

-- CreateEnum
CREATE TYPE "PartyRole"   AS ENUM ('CLIENT', 'SUPPLIER', 'AGENT');
CREATE TYPE "PartyType"   AS ENUM ('INVOICE', 'LEDGER');
CREATE TYPE "Currency"    AS ENUM ('EGP', 'USD');
CREATE TYPE "InvoiceKind" AS ENUM ('SALE', 'PURCHASE');
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'DONE');
CREATE TYPE "UserRole"    AS ENUM ('STAFF', 'CUSTOMER');

-- CreateTable
CREATE TABLE "Party" (
    "id"            SERIAL           NOT NULL,
    "uid"           TEXT             NOT NULL,
    "name"          TEXT             NOT NULL,
    "role"          "PartyRole"      NOT NULL,
    "type"          "PartyType",
    "phone"         TEXT,
    "currency"      "Currency"       NOT NULL DEFAULT 'EGP',
    "opening"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hidden"        BOOLEAN          NOT NULL DEFAULT false,
    "linkedPartyId" INTEGER,
    "createdAt"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
    "id"             SERIAL        NOT NULL,
    "uid"            TEXT          NOT NULL,
    "username"       TEXT,
    "name"           TEXT          NOT NULL,
    "pinHash"        TEXT          NOT NULL,
    "admin"          BOOLEAN       NOT NULL DEFAULT false,
    "views"          TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
    "ledgerPartyIds" TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
    "tokenVersion"   INTEGER       NOT NULL DEFAULT 0,
    "role"           "UserRole"    NOT NULL DEFAULT 'STAFF',
    "partyId"        INTEGER,
    "createdAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)  NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TreasuryAccount" (
    "id"        SERIAL           NOT NULL,
    "uid"       TEXT             NOT NULL,
    "name"      TEXT             NOT NULL,
    "opening"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency"  "Currency"       NOT NULL DEFAULT 'EGP',
    "createdAt" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "TreasuryAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Warehouse" (
    "id"        SERIAL       NOT NULL,
    "uid"       TEXT         NOT NULL,
    "name"      TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Product" (
    "id"        SERIAL       NOT NULL,
    "uid"       TEXT         NOT NULL,
    "name"      TEXT         NOT NULL,
    "unit"      TEXT,
    "service"   BOOLEAN      NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExpenseCategory" (
    "id"        SERIAL       NOT NULL,
    "uid"       TEXT         NOT NULL,
    "name"      TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Transaction" (
    "id"          SERIAL           NOT NULL,
    "uid"         TEXT             NOT NULL,
    "date"        TIMESTAMP(3)     NOT NULL,
    "type"        TEXT             NOT NULL,
    "partyId"     INTEGER,
    "treasuryId"  INTEGER,
    "treasuryId2" INTEGER,
    "categoryId"  INTEGER,
    "debit"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cashIn"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cashOut"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cashIn2"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cashOut2"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expAmt"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pending"     BOOLEAN          NOT NULL DEFAULT false,
    "note"        TEXT,
    "invoiceId"   INTEGER,
    "dealId"      INTEGER,
    "createdById" INTEGER,
    "createdAt"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Invoice" (
    "id"               SERIAL           NOT NULL,
    "uid"              TEXT             NOT NULL,
    "kind"             "InvoiceKind"    NOT NULL,
    "no"               TEXT             NOT NULL,
    "date"             TIMESTAMP(3)     NOT NULL,
    "partyId"          INTEGER          NOT NULL,
    "warehouseId"      INTEGER          NOT NULL,
    "currency"         "Currency"       NOT NULL DEFAULT 'EGP',
    "paid"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    "treasuryId"       INTEGER,
    "note"             TEXT,
    "commissionAmount" DOUBLE PRECISION,
    "commissionTo"     TEXT,
    "createdAt"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceItem" (
    "id"        SERIAL           NOT NULL,
    "uid"       TEXT             NOT NULL,
    "invoiceId" INTEGER          NOT NULL,
    "productId" INTEGER          NOT NULL,
    "qty"       DOUBLE PRECISION NOT NULL,
    "price"     DOUBLE PRECISION NOT NULL,
    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Deal" (
    "id"         SERIAL           NOT NULL,
    "uid"        TEXT             NOT NULL,
    "no"         TEXT             NOT NULL,
    "date"       TIMESTAMP(3)     NOT NULL,
    "clientId"   INTEGER          NOT NULL,
    "supplierId" INTEGER          NOT NULL,
    "paidIn"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidOut"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nawlon"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "treasuryId" INTEGER,
    "note"       TEXT,
    "createdAt"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DealItem" (
    "id"        SERIAL           NOT NULL,
    "uid"       TEXT             NOT NULL,
    "dealId"    INTEGER          NOT NULL,
    "productId" INTEGER          NOT NULL,
    "qty"       DOUBLE PRECISION NOT NULL,
    "price"     DOUBLE PRECISION NOT NULL,
    "buyPrice"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "DealItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Adjustment" (
    "id"          SERIAL           NOT NULL,
    "uid"         TEXT             NOT NULL,
    "date"        TIMESTAMP(3)     NOT NULL,
    "warehouseId" INTEGER          NOT NULL,
    "productId"   INTEGER          NOT NULL,
    "qty"         DOUBLE PRECISION NOT NULL,
    "note"        TEXT,
    "createdAt"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Adjustment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Request" (
    "id"        SERIAL       NOT NULL,
    "uid"       TEXT         NOT NULL,
    "date"      TIMESTAMP(3) NOT NULL,
    "clientId"  INTEGER      NOT NULL,
    "note"      TEXT,
    "done"      BOOLEAN      NOT NULL DEFAULT false,
    "doneDate"  TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RequestItem" (
    "id"        SERIAL           NOT NULL,
    "uid"       TEXT             NOT NULL,
    "requestId" INTEGER          NOT NULL,
    "name"      TEXT             NOT NULL,
    "qty"       DOUBLE PRECISION NOT NULL,
    "received"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "RequestItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Manifest" (
    "id"            SERIAL       NOT NULL,
    "uid"           TEXT         NOT NULL,
    "no"            TEXT         NOT NULL,
    "date"          TIMESTAMP(3) NOT NULL,
    "invoiceId"     INTEGER,
    "clientName"    TEXT         NOT NULL,
    "vehicleNo"     TEXT,
    "trailerNo"     TEXT,
    "driverName"    TEXT,
    "driverPhone"   TEXT,
    "driverNID"     TEXT,
    "clearingAgent" TEXT,
    "note"          TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Manifest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManifestItem" (
    "id"         SERIAL           NOT NULL,
    "uid"        TEXT             NOT NULL,
    "manifestId" INTEGER          NOT NULL,
    "name"       TEXT             NOT NULL,
    "qty"        DOUBLE PRECISION NOT NULL,
    CONSTRAINT "ManifestItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Driver" (
    "id"         SERIAL       NOT NULL,
    "uid"        TEXT         NOT NULL,
    "name"       TEXT         NOT NULL,
    "nationalId" TEXT,
    "phone"      TEXT,
    "phone2"     TEXT,
    "vehicleNo"  TEXT,
    "trailerNo"  TEXT,
    "note"       TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "driver_trips" (
    "id"               SERIAL           NOT NULL,
    "uid"              TEXT             NOT NULL,
    "manifestId"       INTEGER,
    "partyId"          INTEGER,
    "driverName"       TEXT             NOT NULL,
    "vehicleNo"        TEXT,
    "trailerNo"        TEXT,
    "clientName"       TEXT             NOT NULL,
    "departureDate"    TIMESTAMP(3)     NOT NULL,
    "agreedFreight"    DOUBLE PRECISION NOT NULL,
    "note"             TEXT,
    "arrivalDate"      TIMESTAMP(3),
    "delayTxId"        INTEGER,
    "delayFee"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weightDiffAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weightDiffTxId"   INTEGER,
    "createdAt"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "driver_trips_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "driver_payments" (
    "id"          SERIAL           NOT NULL,
    "uid"         TEXT             NOT NULL,
    "tripId"      INTEGER          NOT NULL,
    "date"        TIMESTAMP(3)     NOT NULL,
    "amount"      DOUBLE PRECISION NOT NULL,
    "paymentType" TEXT             NOT NULL DEFAULT 'freight',
    "note"        TEXT,
    "createdAt"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "driver_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Order" (
    "id"        SERIAL        NOT NULL,
    "uid"       TEXT          NOT NULL,
    "date"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name"      TEXT          NOT NULL,
    "phone"     TEXT,
    "note"      TEXT,
    "status"    "OrderStatus" NOT NULL DEFAULT 'NEW',
    "partyId"   INTEGER,
    "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderItem" (
    "id"       SERIAL           NOT NULL,
    "uid"      TEXT             NOT NULL,
    "orderId"  INTEGER          NOT NULL,
    "name"     TEXT             NOT NULL,
    "qty"      DOUBLE PRECISION NOT NULL,
    "received" DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Config" (
    "id"             INTEGER          NOT NULL DEFAULT 1,
    "orderEmail"     TEXT             NOT NULL DEFAULT 'yusuftarek.97@gmail.com',
    "delayGraceDays" INTEGER          NOT NULL DEFAULT 8,
    "delayFeePerDay" DOUBLE PRECISION NOT NULL DEFAULT 1200,
    CONSTRAINT "Config_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id"        SERIAL       NOT NULL,
    "uid"       TEXT         NOT NULL,
    "userName"  TEXT         NOT NULL,
    "action"    TEXT         NOT NULL,
    "entity"    TEXT         NOT NULL,
    "entityUid" TEXT,
    "summary"   TEXT,
    "diff"      JSONB,
    "snapshot"  JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "loans" (
    "id"              SERIAL           NOT NULL,
    "uid"             TEXT             NOT NULL,
    "date"            TIMESTAMP(3)     NOT NULL,
    "borrowerName"    TEXT,
    "partyId"         INTEGER,
    "qty"             DOUBLE PRECISION NOT NULL,
    "note"            TEXT,
    "status"          TEXT             NOT NULL DEFAULT 'OPEN',
    "returnType"      TEXT,
    "returnedQty"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cashReturnedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "returnDate"      TIMESTAMP(3),
    "returnNote"      TEXT,
    "productId"       INTEGER          NOT NULL,
    "warehouseId"     INTEGER          NOT NULL,
    "createdAt"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "loan_returns" (
    "id"           SERIAL           NOT NULL,
    "uid"          TEXT             NOT NULL,
    "loanId"       INTEGER          NOT NULL,
    "date"         TIMESTAMP(3)     NOT NULL,
    "returnType"   TEXT             NOT NULL,
    "qty"          DOUBLE PRECISION NOT NULL,
    "pricePerUnit" DOUBLE PRECISION,
    "note"         TEXT,
    "txId"         INTEGER,
    "createdAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loan_returns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DollarAgent" (
    "id"        SERIAL       NOT NULL,
    "uid"       TEXT         NOT NULL,
    "name"      TEXT         NOT NULL,
    "phone"     TEXT,
    "note"      TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DollarAgent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DollarAgentTx" (
    "id"           SERIAL           NOT NULL,
    "uid"          TEXT             NOT NULL,
    "date"         TIMESTAMP(3)     NOT NULL,
    "agentId"      INTEGER          NOT NULL,
    "type"         TEXT             NOT NULL,
    "egpAmount"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "treasuryId"   INTEGER,
    "usdAmount"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "partyId"      INTEGER,
    "note"         TEXT,
    "createdAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DollarAgentTx_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "Party_uid_key"           ON "Party"("uid");
CREATE UNIQUE INDEX "Party_linkedPartyId_key"  ON "Party"("linkedPartyId");
CREATE UNIQUE INDEX "User_uid_key"             ON "User"("uid");
CREATE UNIQUE INDEX "User_username_key"        ON "User"("username");
CREATE UNIQUE INDEX "TreasuryAccount_uid_key"  ON "TreasuryAccount"("uid");
CREATE UNIQUE INDEX "Warehouse_uid_key"        ON "Warehouse"("uid");
CREATE UNIQUE INDEX "Product_uid_key"          ON "Product"("uid");
CREATE UNIQUE INDEX "ExpenseCategory_uid_key"  ON "ExpenseCategory"("uid");
CREATE UNIQUE INDEX "Transaction_uid_key"      ON "Transaction"("uid");
CREATE UNIQUE INDEX "Invoice_uid_key"          ON "Invoice"("uid");
CREATE UNIQUE INDEX "InvoiceItem_uid_key"      ON "InvoiceItem"("uid");
CREATE UNIQUE INDEX "Deal_uid_key"             ON "Deal"("uid");
CREATE UNIQUE INDEX "DealItem_uid_key"         ON "DealItem"("uid");
CREATE UNIQUE INDEX "Adjustment_uid_key"       ON "Adjustment"("uid");
CREATE UNIQUE INDEX "Request_uid_key"          ON "Request"("uid");
CREATE UNIQUE INDEX "RequestItem_uid_key"      ON "RequestItem"("uid");
CREATE UNIQUE INDEX "Manifest_uid_key"         ON "Manifest"("uid");
CREATE UNIQUE INDEX "ManifestItem_uid_key"     ON "ManifestItem"("uid");
CREATE UNIQUE INDEX "Driver_uid_key"           ON "Driver"("uid");
CREATE UNIQUE INDEX "Driver_name_key"          ON "Driver"("name");
CREATE UNIQUE INDEX "driver_trips_uid_key"     ON "driver_trips"("uid");
CREATE UNIQUE INDEX "driver_payments_uid_key"  ON "driver_payments"("uid");
CREATE UNIQUE INDEX "Order_uid_key"            ON "Order"("uid");
CREATE UNIQUE INDEX "OrderItem_uid_key"        ON "OrderItem"("uid");
CREATE UNIQUE INDEX "AuditLog_uid_key"         ON "AuditLog"("uid");
CREATE UNIQUE INDEX "loans_uid_key"            ON "loans"("uid");
CREATE UNIQUE INDEX "loan_returns_uid_key"     ON "loan_returns"("uid");
CREATE UNIQUE INDEX "DollarAgent_uid_key"      ON "DollarAgent"("uid");
CREATE UNIQUE INDEX "DollarAgentTx_uid_key"    ON "DollarAgentTx"("uid");

-- CreateIndex
CREATE INDEX "Party_role_idx"              ON "Party"("role");
CREATE INDEX "Transaction_partyId_idx"     ON "Transaction"("partyId");
CREATE INDEX "Transaction_treasuryId_idx"  ON "Transaction"("treasuryId");
CREATE INDEX "Transaction_date_idx"        ON "Transaction"("date");
CREATE INDEX "Invoice_kind_idx"            ON "Invoice"("kind");
CREATE INDEX "Invoice_partyId_idx"         ON "Invoice"("partyId");
CREATE INDEX "InvoiceItem_invoiceId_idx"   ON "InvoiceItem"("invoiceId");
CREATE INDEX "DealItem_dealId_idx"         ON "DealItem"("dealId");
CREATE INDEX "Adjustment_warehouseId_idx"  ON "Adjustment"("warehouseId");
CREATE INDEX "Adjustment_productId_idx"    ON "Adjustment"("productId");
CREATE INDEX "Request_clientId_idx"        ON "Request"("clientId");
CREATE INDEX "driver_trips_manifestId_idx" ON "driver_trips"("manifestId");
CREATE INDEX "driver_trips_partyId_idx"    ON "driver_trips"("partyId");
CREATE INDEX "driver_payments_tripId_idx"  ON "driver_payments"("tripId");
CREATE INDEX "AuditLog_createdAt_idx"      ON "AuditLog"("createdAt");
CREATE INDEX "loans_warehouseId_idx"       ON "loans"("warehouseId");
CREATE INDEX "loans_productId_idx"         ON "loans"("productId");
CREATE INDEX "DollarAgentTx_agentId_idx"   ON "DollarAgentTx"("agentId");

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_linkedPartyId_fkey"
    FOREIGN KEY ("linkedPartyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "User" ADD CONSTRAINT "User_partyId_fkey"
    FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_partyId_fkey"
    FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_treasuryId_fkey"
    FOREIGN KEY ("treasuryId") REFERENCES "TreasuryAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_treasuryId2_fkey"
    FOREIGN KEY ("treasuryId2") REFERENCES "TreasuryAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_dealId_fkey"
    FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_partyId_fkey"
    FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_treasuryId_fkey"
    FOREIGN KEY ("treasuryId") REFERENCES "TreasuryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Deal" ADD CONSTRAINT "Deal_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_treasuryId_fkey"
    FOREIGN KEY ("treasuryId") REFERENCES "TreasuryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DealItem" ADD CONSTRAINT "DealItem_dealId_fkey"
    FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealItem" ADD CONSTRAINT "DealItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Adjustment" ADD CONSTRAINT "Adjustment_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Adjustment" ADD CONSTRAINT "Adjustment_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Request" ADD CONSTRAINT "Request_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RequestItem" ADD CONSTRAINT "RequestItem_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Manifest" ADD CONSTRAINT "Manifest_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ManifestItem" ADD CONSTRAINT "ManifestItem_manifestId_fkey"
    FOREIGN KEY ("manifestId") REFERENCES "Manifest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driver_trips" ADD CONSTRAINT "driver_trips_manifestId_fkey"
    FOREIGN KEY ("manifestId") REFERENCES "Manifest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "driver_trips" ADD CONSTRAINT "driver_trips_partyId_fkey"
    FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "driver_payments" ADD CONSTRAINT "driver_payments_tripId_fkey"
    FOREIGN KEY ("tripId") REFERENCES "driver_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Order" ADD CONSTRAINT "Order_partyId_fkey"
    FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "loans" ADD CONSTRAINT "loans_partyId_fkey"
    FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "loans" ADD CONSTRAINT "loans_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loans" ADD CONSTRAINT "loans_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "loan_returns" ADD CONSTRAINT "loan_returns_loanId_fkey"
    FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DollarAgentTx" ADD CONSTRAINT "DollarAgentTx_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "DollarAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DollarAgentTx" ADD CONSTRAINT "DollarAgentTx_treasuryId_fkey"
    FOREIGN KEY ("treasuryId") REFERENCES "TreasuryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DollarAgentTx" ADD CONSTRAINT "DollarAgentTx_partyId_fkey"
    FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;
