-- تنظيف بقايا نظام الكراتين القديم بعد إعادة بناء التصفية.
--
--   * Partner.cartonRate: أُضيف في 20261014140000_carton_settlement، ولم يعد
--     في schema.prisma. تركه يُحدث انحرافاً بين القاعدة والمخطط.
--   * صلاحية settlement.cartons لم يبق لها مسار ولا شاشة، فتظهر كصلاحية
--     مجهولة في شاشة المستخدمين.

ALTER TABLE "Partner" DROP COLUMN IF EXISTS "cartonRate";

UPDATE "User"
   SET views = array_remove(views, 'settlement.cartons')
 WHERE 'settlement.cartons' = ANY(views);
