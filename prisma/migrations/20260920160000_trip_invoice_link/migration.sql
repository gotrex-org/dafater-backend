-- ربط رحلة السواق بالفاتورة: الناولون اللي بيتدفع للسواق (agreedFreight) مقابل
-- بند «ناولون» اللي بيتحصّل من العميل على الفاتورة. رحلة واحدة = فاتورة واحدة.
ALTER TABLE "driver_trips" ADD COLUMN "invoiceId" INTEGER;

CREATE UNIQUE INDEX "driver_trips_invoiceId_key" ON "driver_trips"("invoiceId");

ALTER TABLE "driver_trips"
  ADD CONSTRAINT "driver_trips_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
