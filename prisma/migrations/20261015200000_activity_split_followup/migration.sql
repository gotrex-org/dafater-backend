-- تكملة فصل التجارة عن الشحن: الأجزاء اللي اتضافت لـ 20261015100000_activity_split بعد ما
-- اتطبّق على القاعدة الحقيقية (أرشفة بنود المصاريف + شيل العمولة). كلها آمنة لو اتنفّذت تاني.

ALTER TABLE "ExpenseCategory" ADD COLUMN IF NOT EXISTS "hidden" BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────── شيل العمولة ───────────────────
-- بند مصروف «عمولة» بيتشال لو مش مستخدم (ولو مستخدم بيتأرشف عشان الحركات القديمة).
UPDATE "ExpenseCategory" c SET hidden = true
WHERE c.name LIKE '%عمول%'
  AND (EXISTS (SELECT 1 FROM "Transaction" t WHERE t."categoryId" = c.id)
       OR EXISTS (SELECT 1 FROM "WarehouseExpenseSchedule" s WHERE s."categoryId" = c.id));
DELETE FROM "ExpenseCategory" c
WHERE c.name LIKE '%عمول%' AND c.hidden = false;

-- عمولة فاتورة من غير حركة على حساب حد (مالهاش أي أثر) — بتتمسح من الفاتورة.
UPDATE "Invoice" i SET "commissionAmount" = NULL, "commissionTo" = NULL
WHERE i."commissionAmount" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Transaction" t WHERE t."invoiceId" = i.id AND t.type = 'commission');

-- حسابات «صاحب عمولة» (AGENT) اتشالت من النظام — بتتمسح لو مالهاش أي حركة أو ارتباط.
DELETE FROM "Party" p
WHERE p.role = 'AGENT'
  AND NOT EXISTS (SELECT 1 FROM "Transaction" t WHERE t."partyId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM "Invoice" i WHERE i."partyId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM "InvoiceItem" ii WHERE ii."commissionPartyId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM "DealItem" di WHERE di."commissionPartyId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM "Deal" d WHERE d."clientId" = p.id OR d."supplierId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."partyId" = p.id)
  AND p."linkedPartyId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "Party" o WHERE o."linkedPartyId" = p.id);
