-- ختم سعر صرف الفاتورة على معاملة الطرف الرئيسية للفواتير الدولارية القديمة،
-- عشان متوسط سعر صرف الطرف يتحسب صح في الميزان وكشف الحساب.
UPDATE "Transaction" t
SET "exchangeRate" = i."exchangeRate"
FROM "Invoice" i
WHERE t."invoiceId" = i."id"
  AND t."type" IN ('فاتورة بيع', 'فاتورة شراء')
  AND i."exchangeRate" IS NOT NULL
  AND i."exchangeRate" > 0
  AND t."exchangeRate" = 0;
