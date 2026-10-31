-- دورة كاملة بين كشف العربية ورحلة السائق للبيانات القديمة (نفس منطق
-- common/manifest-trip-sync.ts):
-- ١) كشف من غير رحلة + رحلة من غير كشف على نفس الفاتورة/البيع الخارجي → يتربطوا.
-- ٢) الكشف من غير مستند ورحلته عليها مستند → الكشف ياخده.
-- ٣) بيانات السائق الفاضية على الكشف تتعبّى من الرحلة وسجل السائقين.

WITH cand AS (
  SELECT m."id" AS mid, t."id" AS tid,
         abs(extract(epoch FROM (m."date" - t."departureDate"))) AS d
  FROM "Manifest" m
  JOIN "driver_trips" t
    ON t."manifestId" IS NULL
   AND ((m."invoiceId" IS NOT NULL AND t."invoiceId" = m."invoiceId")
     OR (m."dealId" IS NOT NULL AND t."dealId" = m."dealId"))
  WHERE m."vehicleSource" = 'OURS'
    AND NOT EXISTS (SELECT 1 FROM "driver_trips" x WHERE x."manifestId" = m."id")
),
ranked AS (
  SELECT *,
         row_number() OVER (PARTITION BY mid ORDER BY d, tid) AS rm,
         row_number() OVER (PARTITION BY tid ORDER BY d, mid) AS rt
  FROM cand
)
UPDATE "driver_trips" t
SET "manifestId" = r.mid
FROM ranked r
WHERE t."id" = r.tid AND r.rm = 1 AND r.rt = 1;

UPDATE "Manifest" m
SET "invoiceId" = x."invoiceId", "dealId" = x."dealId"
FROM (
  SELECT DISTINCT ON (t."manifestId") t."manifestId", t."invoiceId", t."dealId"
  FROM "driver_trips" t
  WHERE t."manifestId" IS NOT NULL AND (t."invoiceId" IS NOT NULL OR t."dealId" IS NOT NULL)
  ORDER BY t."manifestId", t."id"
) x
WHERE m."id" = x."manifestId"
  AND m."vehicleSource" = 'OURS'
  AND m."invoiceId" IS NULL AND m."dealId" IS NULL;

UPDATE "Manifest" m
SET "driverName"   = COALESCE(NULLIF(trim(m."driverName"), ''), t."driverName"),
    "vehicleNo"    = COALESCE(NULLIF(trim(m."vehicleNo"), ''), t."vehicleNo"),
    "vehicleLabel" = COALESCE(NULLIF(trim(m."vehicleLabel"), ''), t."vehicleLabel"),
    "trailerNo"    = COALESCE(NULLIF(trim(m."trailerNo"), ''), t."trailerNo")
FROM (
  SELECT DISTINCT ON ("manifestId") * FROM "driver_trips"
  WHERE "manifestId" IS NOT NULL ORDER BY "manifestId", "id"
) t
WHERE m."id" = t."manifestId" AND m."vehicleSource" = 'OURS';

UPDATE "Manifest" m
SET "driverPhone" = COALESCE(NULLIF(trim(m."driverPhone"), ''), d."phone"),
    "driverNID"   = COALESCE(NULLIF(trim(m."driverNID"), ''), d."nationalId")
FROM "Driver" d
WHERE d."name" = trim(m."driverName")
  AND (NULLIF(trim(m."driverPhone"), '') IS NULL OR NULLIF(trim(m."driverNID"), '') IS NULL);
