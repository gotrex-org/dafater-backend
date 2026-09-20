-- أول تسعير للأصناف بيتاخد من الفواتير: آخر سعر اشترينا بيه → سعر الشراء الثابت،
-- وآخر سعر بعنا بيه → سعر البيع الثابت. بيملا الفاضي بس (اللي لسه بصفر) فأي سعر
-- المستخدم حطّه بإيده مابيتلمسش. الفواتير الوهمية وبنود السعر صفر مستبعدين —
-- الأولى مستند بس والتانية مش سعر.
UPDATE "Product" p
SET "purchasePrice" = sub.price
FROM (
  SELECT DISTINCT ON (ii."productId") ii."productId" AS pid, ii.price AS price
  FROM "InvoiceItem" ii
  JOIN "Invoice" i ON i.id = ii."invoiceId"
  WHERE i.kind = 'PURCHASE' AND i.fake = false AND ii.price > 0
  ORDER BY ii."productId", i.date DESC, ii.id DESC
) sub
WHERE p.id = sub.pid AND p."purchasePrice" = 0;

UPDATE "Product" p
SET "salePrice" = sub.price
FROM (
  SELECT DISTINCT ON (ii."productId") ii."productId" AS pid, ii.price AS price
  FROM "InvoiceItem" ii
  JOIN "Invoice" i ON i.id = ii."invoiceId"
  WHERE i.kind = 'SALE' AND i.fake = false AND ii.price > 0
  ORDER BY ii."productId", i.date DESC, ii.id DESC
) sub
WHERE p.id = sub.pid AND p."salePrice" = 0;
