-- تعديلات الفواتير من غير المالك بتستنى موافقته
CREATE TABLE "InvoiceEditRequest" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "requestedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceEditRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvoiceEditRequest_uid_key" ON "InvoiceEditRequest"("uid");
CREATE UNIQUE INDEX "InvoiceEditRequest_invoiceId_key" ON "InvoiceEditRequest"("invoiceId");

ALTER TABLE "InvoiceEditRequest" ADD CONSTRAINT "InvoiceEditRequest_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceEditRequest" ADD CONSTRAINT "InvoiceEditRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
