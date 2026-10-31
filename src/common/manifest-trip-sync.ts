import { PrismaService } from '../prisma/prisma.service';

type Doc = { invoiceId: number | null; dealId: number | null };

/**
 * رحلة السائق بتمشي ورا كشف عربيتها في الفاتورة: لما الكشف يتربط بفاتورة (أو
 * بيع خارجي) رحلات الكشف بتتربط بنفس المستند، ولما يتفك الرحلة اللي كانت على
 * نفس المستند القديم بتتفك معاه. رحلة على مستند تاني غير القديم مابنلمسهاش في
 * الفك.
 *
 * invoiceId و dealId على الرحلة unique، فلو المستند ماسكاه رحلة تانية بره الكشف
 * بنسيبها (مش بنسحبه منها)، وأول رحلة في الكشف بس اللي بتاخده.
 */
export async function syncManifestTrips(prisma: PrismaService, manifestId: number, prev?: Doc) {
  const m = await prisma.manifest.findUnique({
    where: { id: manifestId },
    select: { invoiceId: true, dealId: true, vehicleSource: true, driverTrips: { select: { id: true, invoiceId: true, dealId: true }, orderBy: { id: 'asc' } } },
  });
  if (!m || m.vehicleSource !== 'OURS' || !m.driverTrips.length) return;

  const sameAsPrev = (t: Doc) => !!prev && (
    (prev.invoiceId != null && t.invoiceId === prev.invoiceId) || (prev.dealId != null && t.dealId === prev.dealId)
  );

  // فك: الكشف بقى من غير مستند
  if (m.invoiceId == null && m.dealId == null) {
    const ids = m.driverTrips.filter(sameAsPrev).map((t) => t.id);
    if (ids.length) await prisma.driverTrip.updateMany({ where: { id: { in: ids } }, data: { invoiceId: null, dealId: null } });
    return;
  }

  const holder = await prisma.driverTrip.findFirst({
    where: m.invoiceId != null ? { invoiceId: m.invoiceId } : { dealId: m.dealId },
    select: { id: true, manifestId: true },
  });
  if (holder) return; // رحلة (من الكشف أو من بره) ماسكة المستند بالفعل

  // الرحلة اللي مش مربوطة، أو اللي كانت على المستند القديم، بتاخد الجديد
  const target = m.driverTrips.find((t) => (t.invoiceId == null && t.dealId == null) || sameAsPrev(t)) ?? m.driverTrips[0];
  await prisma.driverTrip.update({ where: { id: target.id }, data: { invoiceId: m.invoiceId, dealId: m.dealId } });
}

const MAX_DAYS = 60;
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, '').trim();
const days = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 86_400_000;

type Side = { vehicleNo: string | null; driverName: string | null };
/** نفس العربية: رقم العربية من غير مسافات، ولو مش مكتوب على الناحيتين يبقى اسم السائق. */
function sameVehicle(a: Side, b: Side) {
  const va = norm(a.vehicleNo), vb = norm(b.vehicleNo);
  if (va && vb) return va === vb;
  const da = norm(a.driverName), db = norm(b.driverName);
  return !!da && da === db;
}

/**
 * ربط تلقائي بين كشف عربية من غير رحلة ورحلة سائق من غير كشف: نفس العميل ونفس
 * العربية وأقرب تاريخ في حدود ٦٠ يوم. بعدها الرحلة بتاخد فاتورة الكشف.
 * بيتنادى بعد إنشاء/تعديل كشف أو رحلة، ومابيلمسش أي ربط موجود.
 */
export async function autoPairManifest(prisma: PrismaService, manifestId: number) {
  const m = await prisma.manifest.findUnique({
    where: { id: manifestId },
    select: { id: true, date: true, clientName: true, vehicleNo: true, driverName: true, vehicleSource: true, _count: { select: { driverTrips: true } } },
  });
  if (!m || m.vehicleSource !== 'OURS' || m._count.driverTrips || !m.clientName.trim()) return;
  const trips = await prisma.driverTrip.findMany({
    where: { manifestId: null, clientName: m.clientName.trim() },
    select: { id: true, departureDate: true, vehicleNo: true, driverName: true },
  });
  const best = trips
    .filter((t) => sameVehicle(t, m) && days(t.departureDate, m.date) <= MAX_DAYS)
    .sort((a, b) => days(a.departureDate, m.date) - days(b.departureDate, m.date))[0];
  if (!best) return;
  await prisma.driverTrip.update({ where: { id: best.id }, data: { manifestId: m.id } });
  await syncManifestTrips(prisma, m.id);
}

export async function autoPairTrip(prisma: PrismaService, tripId: number) {
  const t = await prisma.driverTrip.findUnique({
    where: { id: tripId },
    select: { id: true, manifestId: true, departureDate: true, clientName: true, vehicleNo: true, driverName: true },
  });
  if (!t || t.manifestId != null || !t.clientName.trim()) return;
  const manifests = await prisma.manifest.findMany({
    where: { vehicleSource: 'OURS', clientName: t.clientName.trim(), driverTrips: { none: {} } },
    select: { id: true, date: true, vehicleNo: true, driverName: true },
  });
  const best = manifests
    .filter((m) => sameVehicle(m, t) && days(m.date, t.departureDate) <= MAX_DAYS)
    .sort((a, b) => days(a.date, t.departureDate) - days(b.date, t.departureDate))[0];
  if (!best) return;
  await prisma.driverTrip.update({ where: { id: t.id }, data: { manifestId: best.id } });
  await syncManifestTrips(prisma, best.id);
}
