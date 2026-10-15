import { Activity, Prisma, PrismaClient } from '@prisma/client';

/**
 * نشاط الحركة (تجارة / شحن / مشترك) — بيتحدّد هنا في مكان واحد لكل حركة بتتكتب،
 * بدل ما كل شاشة بتسجّل حركة تفتكر تحطه. أي create/createMany على Transaction من غير
 * `activity` صريح بيعدّي على stampActivity().
 *
 * القواعد:
 *  - أنواع الشحن الثابتة (جمارك، سداد مكتب تخليص، كشف السائق، عطلة العربية، بنود شحن
 *    الفاتورة) → شحن.
 *  - مصروف مخزن → نشاط البند (لو مالوش بند → شحن).
 *  - أي حركة عليها بند مصروف → نشاط البند.
 *  - مصروف مربوط بعربية → شحن.
 *  - غير كده → تجارة.
 *  - المشترك (المرتبات) بيتثبّت عليه نصيب الشحن % من الإعدادات وقت التسجيل.
 *
 * نفس القواعد دي مكتوبة SQL في migration ‏activity_split عشان الحركات القديمة.
 */
export const SHIPPING_TX_TYPES = [
  'جمارك',
  'سداد مخلّص',
  'driverFreight',
  'driverTea',
  'driverDelay',
  'driverWeightDiff',
  'driverAdvance',
  'سلفة سائق',
  'truckDelay',
  'truckWeightDiff',
  'بنود شحن',
];
const SHIPPING_SET = new Set(SHIPPING_TX_TYPES);

/** نوع حركة بنود الشحن على الفاتورة (رجل منفصلة عن رجل الأصناف). */
export const INVOICE_CHARGES_TX_TYPE = 'بنود شحن';

type Data = Record<string, any>;

async function stampActivity(prisma: PrismaClient, d: Data) {
  if (!d || d.activity !== undefined) return;

  const catId: number | undefined = d.categoryId ?? d.category?.connect?.id;
  const catUid: string | undefined = d.category?.connect?.uid;
  const cat = catId || catUid
    ? await prisma.expenseCategory.findUnique({
        where: catId ? { id: catId } : { uid: catUid! },
        select: { activity: true },
      })
    : null;

  let a: Activity = 'TRADE';
  if (SHIPPING_SET.has(d.type)) a = 'SHIPPING';
  else if (d.type === 'مصروف مخزن') a = cat?.activity ?? 'SHIPPING';
  else if (cat) a = cat.activity;

  const onVehicle = d.manifestId != null || d.manifest?.connect != null;
  if (a === 'TRADE' && onVehicle && typeof d.type === 'string' && d.type.startsWith('مصروف')) a = 'SHIPPING';

  d.activity = a;
  if (a === 'SHARED' && d.shippingPct == null) {
    const cfg = await prisma.config.findUnique({ where: { id: 1 }, select: { salaryShippingPct: true } });
    d.shippingPct = cfg?.salaryShippingPct ?? 50;
  }
}

export function registerActivityMiddleware(prisma: PrismaClient) {
  prisma.$use(async (params: Prisma.MiddlewareParams, next) => {
    if (params.model === 'Transaction' && (params.action === 'create' || params.action === 'createMany')) {
      const data = params.args?.data;
      const rows: Data[] = Array.isArray(data) ? data : [data];
      for (const row of rows) await stampActivity(prisma, row);
    }
    return next(params);
  });
}

/**
 * نصيب الشحن من مبلغ حركة — للتقارير. شحن = كله، تجارة = صفر، مشترك = بالنسبة المتثبّتة.
 */
export function shippingPortion(amount: number, activity: Activity, shippingPct?: number | null) {
  if (activity === 'SHIPPING') return amount;
  if (activity === 'SHARED') return amount * ((shippingPct ?? 50) / 100);
  return 0;
}
