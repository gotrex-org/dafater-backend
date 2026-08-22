-- ملاحظة تظهر للعميل في بوابته بدل البيان الداخلي (التحصيل بيظهر "استلام نقدية" من غيرها)
ALTER TABLE "Transaction" ADD COLUMN "clientNote" TEXT;
