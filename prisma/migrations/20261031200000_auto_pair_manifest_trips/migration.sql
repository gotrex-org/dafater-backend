-- ربط تلقائي للبيانات القديمة: كشف عربية (عربيتنا) من غير رحلة + رحلة سائق من غير
-- كشف، نفس العميل ونفس رقم العربية (من غير مسافات؛ ولو مش مكتوب يبقى اسم السائق)،
-- وأقرب تاريخ في حدود ٦٠ يوم. كل كشف ياخد رحلة واحدة وكل رحلة كشف واحد.

WITH cand AS (
  SELECT m."id" AS mid, t."id" AS tid,
         abs(extract(epoch FROM (m."date" - t."departureDate"))) / 86400 AS d
  FROM "Manifest" m
  JOIN "driver_trips" t
    ON t."manifestId" IS NULL
   AND trim(t."clientName") = trim(m."clientName")
  WHERE m."vehicleSource" = 'OURS'
    AND trim(m."clientName") <> ''
    AND NOT EXISTS (SELECT 1 FROM "driver_trips" x WHERE x."manifestId" = m."id")
    AND (
      (regexp_replace(coalesce(m."vehicleNo", ''), '\s', '', 'g') <> ''
        AND regexp_replace(coalesce(t."vehicleNo", ''), '\s', '', 'g') <> ''
        AND regexp_replace(coalesce(m."vehicleNo", ''), '\s', '', 'g') = regexp_replace(coalesce(t."vehicleNo", ''), '\s', '', 'g'))
      OR
      ((regexp_replace(coalesce(m."vehicleNo", ''), '\s', '', 'g') = '' OR regexp_replace(coalesce(t."vehicleNo", ''), '\s', '', 'g') = '')
        AND regexp_replace(coalesce(m."driverName", ''), '\s', '', 'g') <> ''
        AND regexp_replace(coalesce(m."driverName", ''), '\s', '', 'g') = regexp_replace(coalesce(t."driverName", ''), '\s', '', 'g'))
    )
),
ranked AS (
  SELECT *,
         row_number() OVER (PARTITION BY mid ORDER BY d, tid) AS rm,
         row_number() OVER (PARTITION BY tid ORDER BY d, mid) AS rt
  FROM cand
  WHERE d <= 60
)
UPDATE "driver_trips" t
SET "manifestId" = r.mid
FROM ranked r
WHERE t."id" = r.tid AND r.rm = 1 AND r.rt = 1;

-- الرحلات اللي اتربطت دلوقتي بتاخد فاتورة/بيع خارجي الكشف (نفس 20261031190000)
UPDATE "driver_trips" t
SET "invoiceId" = x."invoiceId"
FROM (
  SELECT DISTINCT ON (m."invoiceId") tr."id" AS trip_id, m."invoiceId"
  FROM "Manifest" m
  JOIN "driver_trips" tr ON tr."manifestId" = m."id"
  WHERE m."vehicleSource" = 'OURS'
    AND m."invoiceId" IS NOT NULL
    AND tr."invoiceId" IS NULL AND tr."dealId" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "driver_trips" h WHERE h."invoiceId" = m."invoiceId")
  ORDER BY m."invoiceId", tr."id"
) x
WHERE t."id" = x.trip_id;

UPDATE "driver_trips" t
SET "dealId" = x."dealId"
FROM (
  SELECT DISTINCT ON (m."dealId") tr."id" AS trip_id, m."dealId"
  FROM "Manifest" m
  JOIN "driver_trips" tr ON tr."manifestId" = m."id"
  WHERE m."vehicleSource" = 'OURS'
    AND m."dealId" IS NOT NULL
    AND tr."invoiceId" IS NULL AND tr."dealId" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "driver_trips" h WHERE h."dealId" = m."dealId")
  ORDER BY m."dealId", tr."id"
) x
WHERE t."id" = x.trip_id;
