-- فصل نشاط التجارة عن نشاط الشحن
--   * Activity على كل حركة مالية (TRADE / SHIPPING / SHARED) + نسبة الشحن المتثبّتة للمشترك
--   * بنود الشحن على الفاتورة في جدول منفصل (InvoiceCharge) بقائمة بنود (ChargeType)
--   * نشاط بند المصروف + ربطه بعربية، ونسبة المرتبات في الإعدادات، وملاحظات مكتب التخليص
--   * نقل النولون/التحميل/الشفتنة المسجّلة كأصناف في الفواتير القديمة إلى جدول البنود
--   * تحديد نشاط كل الحركات القديمة بنفس قواعد src/common/activity.ts

-- ───────────────────────────── DDL ─────────────────────────────

CREATE TYPE "Activity" AS ENUM ('TRADE', 'SHIPPING', 'SHARED');

ALTER TABLE "Config" ADD COLUMN "salaryShippingPct" DOUBLE PRECISION NOT NULL DEFAULT 50;

ALTER TABLE "ExpenseCategory" ADD COLUMN "activity" "Activity" NOT NULL DEFAULT 'TRADE',
ADD COLUMN "vehicleLink" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Party" ADD COLUMN "note" TEXT;

ALTER TABLE "Transaction" ADD COLUMN "activity" "Activity" NOT NULL DEFAULT 'TRADE',
ADD COLUMN "shippingPct" DOUBLE PRECISION;

CREATE TABLE "ChargeType" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChargeType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceCharge" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "chargeTypeId" INTEGER NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "price" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "manifestId" INTEGER,

    CONSTRAINT "InvoiceCharge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChargeType_uid_key" ON "ChargeType"("uid");
CREATE UNIQUE INDEX "ChargeType_name_key" ON "ChargeType"("name");
CREATE UNIQUE INDEX "InvoiceCharge_uid_key" ON "InvoiceCharge"("uid");
CREATE INDEX "InvoiceCharge_invoiceId_idx" ON "InvoiceCharge"("invoiceId");
CREATE INDEX "InvoiceCharge_manifestId_idx" ON "InvoiceCharge"("manifestId");
CREATE INDEX "Transaction_activity_idx" ON "Transaction"("activity");

ALTER TABLE "InvoiceCharge" ADD CONSTRAINT "InvoiceCharge_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceCharge" ADD CONSTRAINT "InvoiceCharge_chargeTypeId_fkey" FOREIGN KEY ("chargeTypeId") REFERENCES "ChargeType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceCharge" ADD CONSTRAINT "InvoiceCharge_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "Manifest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───────────────────── بنود الشحن المبدئية ─────────────────────

INSERT INTO "ChargeType" ("uid", "name", "sortOrder", "updatedAt") VALUES
  ('ct_' || md5('نولون'), 'نولون', 1, CURRENT_TIMESTAMP),
  ('ct_' || md5('تحميل'), 'تحميل', 2, CURRENT_TIMESTAMP),
  ('ct_' || md5('شفتنة'), 'شفتنة', 3, CURRENT_TIMESTAMP);

-- ─────────── نقل الأصناف الخدمية (البنود) من جدول الأصناف إلى بنود الشحن ───────────
-- أي بند = شحن. كل صنف خدمي (service) بيبقى بند شحن بنفس اسمه («ناولون» ← «نولون»)،
-- وسطوره في الفواتير بتتنقل لجدول البنود. السطر اللي عليه ناولون داخلي/شاي/عمولة بيفضل
-- صنف زي ما هو، لأن حركاته الخاصة مربوطة بالسطر.

-- بنود الشحن بتتحصّل من العميل على فاتورة البيع (الإيجار بيتدفع للسائق من كشف
-- السائقين)، فالصنف الخدمي بيبقى بند لو كان متثبّت على فواتير البيع أو مستخدم في أي
-- فاتورة. صنف خدمي متثبّت على الشراء بس ومش مستخدم (زي «شاي») بيفضل صنف زي ما هو.
CREATE TEMP TABLE _charge_products ON COMMIT DROP AS
SELECT p.id, CASE WHEN p.name = 'ناولون' THEN 'نولون' ELSE btrim(p.name) END AS charge_name
FROM "Product" p
WHERE p.service = true
  AND (p."pinSale" = true
       OR p.name IN ('ناولون', 'نولون', 'تحميل', 'شفتنة')
       OR EXISTS (SELECT 1 FROM "InvoiceItem" ii WHERE ii."productId" = p.id));

INSERT INTO "ChargeType" ("uid", "name", "sortOrder", "updatedAt")
SELECT 'ct_' || md5(n.charge_name), n.charge_name, 3 + ROW_NUMBER() OVER (ORDER BY n.first_id), CURRENT_TIMESTAMP
FROM (SELECT charge_name, MIN(id) AS first_id FROM _charge_products GROUP BY 1) n
WHERE NOT EXISTS (SELECT 1 FROM "ChargeType" ct WHERE ct.name = n.charge_name);

CREATE TEMP TABLE _charge_map ON COMMIT DROP AS
SELECT cp.id AS product_id, ct.id AS charge_type_id, ct.name AS charge_name
FROM _charge_products cp
JOIN "ChargeType" ct ON ct.name = cp.charge_name;

CREATE TEMP TABLE _moved ON COMMIT DROP AS
SELECT ii.id AS item_id, ii."invoiceId" AS invoice_id, m.charge_type_id, m.charge_name, ii.qty, ii.price
FROM "InvoiceItem" ii
JOIN _charge_map m ON m.product_id = ii."productId"
WHERE ii.freight = 0 AND ii.tea = 0 AND ii.commission = 0;

INSERT INTO "InvoiceCharge" ("uid", "invoiceId", "chargeTypeId", "qty", "price")
SELECT 'ic_' || md5(item_id::text || '-activity-split'), invoice_id, charge_type_id, qty, price
FROM _moved;

-- إعادة ترحيل حركة الطرف للفواتير المنقولة: رجل الأصناف (تجارة) + رجل بنود الشحن
-- (شحن)، والخصم من الأصناف الأول — نفس buildTxns في invoices.repository.ts.
CREATE TEMP TABLE _inv ON COMMIT DROP AS
SELECT
  i.id, i.kind, i.no, i.discount,
  (SELECT COALESCE(SUM(m.qty * m.price), 0) FROM _moved m WHERE m.invoice_id = i.id) AS charges,
  (SELECT COALESCE(SUM(ii.qty * ii.price), 0) FROM "InvoiceItem" ii
     WHERE ii."invoiceId" = i.id AND ii.id NOT IN (SELECT item_id FROM _moved)) AS items,
  (SELECT string_agg(DISTINCT m.charge_name, '، ') FROM _moved m WHERE m.invoice_id = i.id) AS names
FROM "Invoice" i
WHERE i.id IN (SELECT invoice_id FROM _moved) AND i.fake = false;

ALTER TABLE _inv ADD COLUMN trade_net DOUBLE PRECISION, ADD COLUMN ship_net DOUBLE PRECISION;
UPDATE _inv SET
  trade_net = items - LEAST(COALESCE(discount, 0), items),
  ship_net  = charges - (COALESCE(discount, 0) - LEAST(COALESCE(discount, 0), items));

INSERT INTO "Transaction" (
  "uid", "date", "type", "partyId", "debit", "credit", "note", "invoiceId",
  "createdById", "exchangeRate", "activity", "createdAt"
)
SELECT
  'tx_' || md5(t.id::text || '-activity-split'),
  t.date, 'بنود شحن', t."partyId",
  CASE WHEN v.kind = 'SALE' THEN v.ship_net ELSE 0 END,
  CASE WHEN v.kind = 'SALE' THEN 0 ELSE v.ship_net END,
  'بنود شحن فاتورة ' || CASE WHEN v.kind = 'SALE' THEN 'بيع' ELSE 'شراء' END || ' #' || v.no || ' (' || v.names || ')',
  t."invoiceId", t."createdById", t."exchangeRate", 'SHIPPING', t."createdAt"
FROM _inv v
JOIN "Transaction" t ON t."invoiceId" = v.id
  AND t.type = CASE WHEN v.kind = 'SALE' THEN 'فاتورة بيع' ELSE 'فاتورة شراء' END
WHERE v.charges <> 0;

UPDATE "Transaction" t SET
  debit  = CASE WHEN v.kind = 'SALE' THEN v.trade_net ELSE t.debit END,
  credit = CASE WHEN v.kind = 'SALE' THEN t.credit ELSE v.trade_net END
FROM _inv v
WHERE t."invoiceId" = v.id
  AND t.type = CASE WHEN v.kind = 'SALE' THEN 'فاتورة بيع' ELSE 'فاتورة شراء' END;

-- فاتورة بقت بنود شحن بس → رجل الأصناف الصفرية بتتشال (نفس قاعدة الكود).
DELETE FROM "Transaction" t
USING _inv v
WHERE t."invoiceId" = v.id AND v.trade_net = 0 AND v.charges <> 0
  AND t.type = CASE WHEN v.kind = 'SALE' THEN 'فاتورة بيع' ELSE 'فاتورة شراء' END;

DELETE FROM "InvoiceItem" WHERE id IN (SELECT item_id FROM _moved);

-- الأصناف الخدمية اللي اتنقلت بقت بنود — تتأرشف وتتفك من التثبيت عشان ماتظهرش في
-- جدول الأصناف. لو لسه في سطر عليه ناولون داخلي/شاي/عمولة بيفضل زي ما هو.
UPDATE "Product" p SET hidden = true, "pinSale" = false, "pinPurchase" = false
WHERE p.id IN (SELECT product_id FROM _charge_map)
  AND NOT EXISTS (SELECT 1 FROM "InvoiceItem" ii WHERE ii."productId" = p.id);

-- ─────────────────── بنود مصاريف المخزن ونشاطها ───────────────────

-- كل مصاريف المخزن على الشحن، إلا المرتبات (مشتركة) والعمولة والمتنوع (تجارة).
UPDATE "ExpenseCategory" SET activity = 'SHIPPING'
WHERE "group" = 'WAREHOUSE' AND name NOT IN ('مرتبات', 'عمولة', 'متنوع');
UPDATE "ExpenseCategory" SET activity = 'SHARED' WHERE name = 'مرتبات';

-- «إيجار» القديم هو إيجار المخزن.
UPDATE "ExpenseCategory" SET name = 'إيجار المخزن'
WHERE name = 'إيجار' AND NOT EXISTS (SELECT 1 FROM "ExpenseCategory" WHERE name = 'إيجار المخزن');

INSERT INTO "ExpenseCategory" ("uid", "name", "group", "addsToGoods", "activity", "vehicleLink", "updatedAt")
SELECT 'ec_' || md5(n.name), n.name, 'WAREHOUSE', false, n.activity::"Activity", n.vehicle_link, CURRENT_TIMESTAMP
FROM (VALUES
  ('إيجار المخزن', 'SHIPPING', false),
  ('شفتنة', 'SHIPPING', true),
  ('تحميل', 'SHIPPING', true),
  ('كهرباء', 'SHIPPING', false),
  ('غاز', 'SHIPPING', false),
  ('صيانة', 'SHIPPING', false),
  ('غفرة', 'SHIPPING', false),
  ('مرتبات', 'SHARED', false)
) AS n(name, activity, vehicle_link)
WHERE NOT EXISTS (SELECT 1 FROM "ExpenseCategory" c WHERE c.name = n.name)
  -- «كهرباء ومياه» الموجود بيغطي الكهرباء
  AND NOT (n.name = 'كهرباء' AND EXISTS (SELECT 1 FROM "ExpenseCategory" c WHERE c.name = 'كهرباء ومياه'));

UPDATE "ExpenseCategory" SET "vehicleLink" = true, activity = 'SHIPPING' WHERE name IN ('تحميل', 'شفتنة');

-- ─────────────────── نشاط الحركات القديمة ───────────────────

UPDATE "Transaction" SET activity = 'SHIPPING'
WHERE type IN ('جمارك', 'سداد مخلّص', 'driverFreight', 'driverTea', 'driverDelay', 'driverWeightDiff',
               'driverAdvance', 'سلفة سائق', 'truckDelay', 'truckWeightDiff', 'بنود شحن');

UPDATE "Transaction" t SET activity = c.activity
FROM "ExpenseCategory" c
WHERE t."categoryId" = c.id
  AND t.type NOT IN ('جمارك', 'سداد مخلّص', 'driverFreight', 'driverTea', 'driverDelay', 'driverWeightDiff',
                     'driverAdvance', 'سلفة سائق', 'truckDelay', 'truckWeightDiff', 'بنود شحن');

UPDATE "Transaction" SET activity = 'SHIPPING'
WHERE type = 'مصروف مخزن' AND "categoryId" IS NULL;

UPDATE "Transaction" SET activity = 'SHIPPING'
WHERE "manifestId" IS NOT NULL AND type LIKE 'مصروف%' AND activity = 'TRADE';

UPDATE "Transaction" SET "shippingPct" = (SELECT COALESCE(MAX("salaryShippingPct"), 50) FROM "Config")
WHERE activity = 'SHARED' AND "shippingPct" IS NULL;

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
