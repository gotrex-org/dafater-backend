-- رحلة السائق بتاخد فاتورة كشف عربيتها: ربط الرحلات القديمة اللي كشفها مربوط
-- بفاتورة أو بيع خارجي والرحلة نفسها مش مربوطة. رحلة واحدة بس لكل كشف (أقدم رحلة)،
-- والمستند اللي ماسكاه رحلة تانية بيتساب لأن العمود unique.

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
