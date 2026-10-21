-- تكملة فصل التجارة عن الشحن: الأجزاء اللي اتضافت لـ 20261015100000_activity_split بعد ما
-- اتطبّق على القاعدة الحقيقية (أرشفة بنود المصاريف + شيل العمولة). كلها آمنة لو اتنفّذت تاني.

ALTER TABLE "ExpenseCategory" ADD COLUMN IF NOT EXISTS "hidden" BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────── شيل العمولة ───────────────────
-- بند مصروف «عمولة» بيتأرشف، وبيتمسح لو مش مرتبط بأي حاجة (أي FK بيمنع المسح → يفضل مؤرشف).
UPDATE "ExpenseCategory" SET hidden = true WHERE name LIKE '%عمول%';
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM "ExpenseCategory" WHERE name LIKE '%عمول%' LOOP
    BEGIN
      DELETE FROM "ExpenseCategory" WHERE id = r.id;
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
  END LOOP;
END $$;

-- عمولة فاتورة من غير حركة على حساب حد (مالهاش أي أثر) — بتتمسح من الفاتورة.
UPDATE "Invoice" i SET "commissionAmount" = NULL, "commissionTo" = NULL
WHERE i."commissionAmount" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Transaction" t WHERE t."invoiceId" = i.id AND t.type = 'commission');

-- حسابات «صاحب عمولة» (AGENT) اتشالت من النظام — بتتمسح لو مالهاش أي حركة أو ارتباط.
-- أي جدول تاني مربوط بالحساب (FK) بيمنع المسح والحساب بيفضل زي ما هو بدل ما الـ migration تقع.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.id FROM "Party" p
    WHERE p.role = 'AGENT'
      AND NOT EXISTS (SELECT 1 FROM "Transaction" t WHERE t."partyId" = p.id)
      AND NOT EXISTS (SELECT 1 FROM "InvoiceItem" ii WHERE ii."commissionPartyId" = p.id)
      AND NOT EXISTS (SELECT 1 FROM "DealItem" di WHERE di."commissionPartyId" = p.id)
      AND p."linkedPartyId" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "Party" o WHERE o."linkedPartyId" = p.id)
  LOOP
    BEGIN
      DELETE FROM "Party" WHERE id = r.id;
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
  END LOOP;
END $$;
