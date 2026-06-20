/**
 * Seed — ports the original app's bootstrap data (imported clients & products,
 * default admin user, treasury, warehouses, expense categories, config).
 * Idempotent: if a User already exists, master data seeding is skipped.
 */
import { PrismaClient, PartyRole, PartyType, Currency } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ALL_VIEWS = [
  'dash', 'invoices', 'deals', 'orders', 'requests', 'manifests',
  'entry', 'inventory', 'ledger', 'treasury', 'settings',
];

// from original IMPORT_CLIENTS (n=name, o=opening, t=type)
const IMPORT_CLIENTS: { n: string; o: number; t?: string }[] = [
  { n: 'عثمان حامد', o: 20244276, t: 'invoice' }, { n: 'محمود الشيخ', o: 2678678, t: 'invoice' },
  { n: 'عبدالله اسماعيل', o: 260 }, { n: 'حامد موسي', o: 1283451 }, { n: 'خالد عميد', o: 0 },
  { n: 'محمد داوود', o: 0 }, { n: 'مصعب ادريس', o: 1022958 }, { n: 'خالد الفيومي', o: -146371 },
  { n: 'وائل الفيومي', o: -4760395 }, { n: 'حسب الرسول', o: 162750 }, { n: 'محمود رشوان', o: -1733071 },
  { n: 'ابو غزالة', o: -24930 }, { n: 'محمد حمد صني', o: 0 }, { n: 'ديدي', o: 0 }, { n: 'اوليفي', o: 0 },
  { n: 'سن توب', o: 0 }, { n: 'الشيخ وليد', o: 0 }, { n: 'وائل الامير', o: -34886 },
  { n: 'باقي العملاء', o: -415000 }, { n: 'محمد رزق', o: 0 }, { n: 'مصعب حسين', o: -1672566 },
  { n: 'رويال باك', o: 884950 }, { n: 'حسن الشيخ', o: -2425 }, { n: 'بشير تبع حسن', o: 0 },
  { n: 'ابوبكر محمد علي', o: 53700 }, { n: 'محمد علي بورسودان', o: 0 }, { n: 'محمد ابوسديري', o: -92086 },
  { n: 'خالد زبون جيمي', o: 210010 }, { n: 'الاشقاء', o: -2922314 }, { n: 'يوسف تامر اسوان', o: 2430 },
  { n: 'هاني الصعيدي', o: 0 }, { n: 'ابو تميم', o: 343579.25 }, { n: 'جيمي', o: 584695 },
  { n: 'خالد حامد ابوداوود', o: 293470 }, { n: 'عبدالله وليد', o: 0 }, { n: 'محمد سرحان', o: -12000 },
  { n: 'ابوشامة', o: 0 }, { n: 'رمضان', o: 0 }, { n: 'عباس ايطاليا', o: 0 }, { n: 'بشير', o: 0 },
  { n: 'حامد محمد', o: 0 }, { n: 'جعفر عثمان', o: 0 }, { n: 'خليل السوداني', o: 0 },
  { n: 'انس ياسر', o: 0 }, { n: 'عبدالنعيم تبع خالد الزبير', o: 0 }, { n: 'حاج محمد فيوم', o: 0 },
  { n: 'احمد هاشم غالية', o: 0 },
];

const IMPORT_PRODUCTS = [
  'اندومي', 'فرحة', 'ماجي شريط', 'جبنه رودس ربع', 'لبان ميلونا', 'ديدي 16 علبة', 'كيك اكسترا',
  'ماكستيلا كيلو', 'فيمتو زجاج', 'اوكسي كيلو', 'سيجنال صغير', 'اكياس الحسن', 'عصير كارما',
  'بابريكان زجاج', 'اوكسي سائل 600', 'بسكويت زينة 2', 'بيبسي ميني تربو', 'لبان اوشا',
  'رويال باك صغير', 'تونة سي ويلز', 'عصير واو', 'بيرسول', 'زيت شيف', 'لوكس ص', 'فاين بيبي4',
  'فاين بيبي2', 'تيكا اكلير', 'سيجنال كبير', 'عصير الراوي', 'مياه لافي 600', 'لافي لتر',
  'مسحوق فل', 'باباي', 'مكرونه شوال', 'استيم', 'سن توب', 'لولي بوب', 'بسكوت باولا',
  'رويال باك كرتون', 'ماكستيلا زجاج', 'خل كبير', 'خل صغير', 'عبور 1/8', 'تونه توليدو',
  'ذره حلوه توليدو', 'خوخ توليدو', 'مشروم توليدو', 'رويال باك كبير', 'زيتون برطمان',
  'زيت زيتون اوليفي', 'مكرونه فرحه علبه',
];

async function main() {
  // ---- config singleton ----
  await prisma.config.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, orderEmail: 'yusuftarek.97@gmail.com' },
  });

  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    console.log('Users already present — skipping master-data seed.');
    return;
  }

  // ---- users ----
  await prisma.user.create({
    data: {
      name: 'مدير',
      pinHash: await bcrypt.hash('0000', 10),
      admin: true,
      views: ALL_VIEWS,
    },
  });
  await prisma.user.create({
    data: {
      name: 'موظف',
      pinHash: await bcrypt.hash('1111', 10),
      admin: false,
      views: ['dash', 'invoices', 'entry', 'inventory', 'ledger', 'requests', 'manifests'],
    },
  });

  // ---- treasury ----
  await prisma.treasuryAccount.createMany({
    data: [
      { name: 'الخزينة الرئيسية', opening: 0, currency: Currency.EGP },
      { name: 'حساب التصدير (دولار)', opening: 0, currency: Currency.USD },
    ],
  });

  // ---- warehouses ----
  await prisma.warehouse.createMany({
    data: [{ name: 'المخزن الرئيسي' }, { name: 'مخزن 2' }],
  });

  // ---- expense categories ----
  await prisma.expenseCategory.createMany({
    data: [
      { name: 'إيجار' }, { name: 'مرتبات' }, { name: 'كهرباء ومياه' },
      { name: 'نقل وشحن' }, { name: 'عمولة' }, { name: 'متنوع' },
    ],
  });

  // ---- clients ----
  for (const c of IMPORT_CLIENTS) {
    await prisma.party.create({
      data: {
        name: c.n,
        role: PartyRole.CLIENT,
        type: c.t === 'invoice' ? PartyType.INVOICE : PartyType.LEDGER,
        opening: c.o,
      },
    });
  }

  // ---- a couple of suppliers to start ----
  await prisma.party.createMany({
    data: [
      { name: 'مورد عام', role: PartyRole.SUPPLIER, opening: 0 },
      { name: 'مصنع المشروبات', role: PartyRole.SUPPLIER, opening: 0 },
    ],
  });

  // ---- products ----
  await prisma.product.createMany({
    data: IMPORT_PRODUCTS.map((name) => ({ name })),
  });

  console.log('✔ Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
