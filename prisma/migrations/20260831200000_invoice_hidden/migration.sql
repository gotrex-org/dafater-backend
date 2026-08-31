-- أرشفة الفواتير: إخفاء من القوايم والتابات والبوابة، من غير أي مساس بالحركات
-- ولا بأرقام كشف الحساب والتقارير.
ALTER TABLE "Invoice" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Invoice_hidden_idx" ON "Invoice"("hidden");
