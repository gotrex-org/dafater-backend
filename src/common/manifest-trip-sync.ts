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
    select: { id: true, date: true, clientName: true, vehicleNo: true, driverName: true, vehicleSource: true, invoiceId: true, dealId: true, _count: { select: { driverTrips: true } } },
  });
  if (!m || m.vehicleSource !== 'OURS' || m._count.driverTrips) return;
  // أقوى دليل: رحلة من غير كشف مربوطة بنفس فاتورة/بيع خارجي الكشف
  if (m.invoiceId != null || m.dealId != null) {
    const byDoc = await prisma.driverTrip.findFirst({
      where: { manifestId: null, ...(m.invoiceId != null ? { invoiceId: m.invoiceId } : { dealId: m.dealId }) },
      select: { id: true },
    });
    if (byDoc) {
      await prisma.driverTrip.update({ where: { id: byDoc.id }, data: { manifestId: m.id } });
      await copyTripToManifest(prisma, byDoc.id);
      return;
    }
  }
  if (!m.clientName.trim()) return;
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
  await copyTripToManifest(prisma, best.id);
}

export async function autoPairTrip(prisma: PrismaService, tripId: number) {
  const t = await prisma.driverTrip.findUnique({
    where: { id: tripId },
    select: { id: true, manifestId: true, departureDate: true, clientName: true, vehicleNo: true, driverName: true, invoiceId: true, dealId: true },
  });
  if (!t || t.manifestId != null) return;
  // أقوى دليل: كشف من غير رحلة مربوط بنفس فاتورة/بيع خارجي الرحلة (أقرب تاريخ)
  if (t.invoiceId != null || t.dealId != null) {
    const byDoc = await prisma.manifest.findMany({
      where: { vehicleSource: 'OURS', driverTrips: { none: {} }, ...(t.invoiceId != null ? { invoiceId: t.invoiceId } : { dealId: t.dealId }) },
      select: { id: true, date: true },
    });
    const near = byDoc.sort((a, b) => days(a.date, t.departureDate) - days(b.date, t.departureDate))[0];
    if (near) {
      await prisma.driverTrip.update({ where: { id: t.id }, data: { manifestId: near.id } });
      await copyTripToManifest(prisma, t.id);
      return;
    }
  }
  if (!t.clientName.trim()) return;
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
  await copyTripToManifest(prisma, t.id);
}

const clean = (s: string | null | undefined) => (s ?? '').trim() || null;

/**
 * بيانات السائق على كشف العربية مصدرها رحلته: الاسم ورقم العربية ومسمّاها
 * والمقطورة من الرحلة، والرقم القومي والتليفون من سجل السائقين. بيتنادى لما
 * الرحلة تتربط بالكشف أو بياناتها تتعدّل. القيمة الفاضية في الرحلة ماتمسحش
 * المكتوب على الكشف.
 */
export async function copyTripToManifest(prisma: PrismaService, tripId: number) {
  const t = await prisma.driverTrip.findUnique({
    where: { id: tripId },
    select: { manifestId: true, driverName: true, vehicleNo: true, vehicleLabel: true, trailerNo: true },
  });
  if (!t?.manifestId) return;
  const m = await prisma.manifest.findUnique({
    where: { id: t.manifestId },
    select: { driverName: true, driverPhone: true, driverNID: true, vehicleSource: true },
  });
  if (!m || m.vehicleSource !== 'OURS') return;
  const name = clean(t.driverName);
  const driverChanged = !!name && norm(name) !== norm(m.driverName);
  const reg = name ? await prisma.driver.findUnique({ where: { name }, select: { phone: true, nationalId: true } }) : null;
  const data: Record<string, string | null> = {};
  if (name) data.driverName = name;
  if (clean(t.vehicleNo)) data.vehicleNo = clean(t.vehicleNo);
  if (clean(t.vehicleLabel)) data.vehicleLabel = clean(t.vehicleLabel);
  if (clean(t.trailerNo)) data.trailerNo = clean(t.trailerNo);
  // سائق تاني: التليفون والرقم القومي القديمين مايخصّوهوش
  if (driverChanged || !clean(m.driverPhone)) data.driverPhone = clean(reg?.phone) ?? (driverChanged ? null : m.driverPhone);
  if (driverChanged || !clean(m.driverNID)) data.driverNID = clean(reg?.nationalId) ?? (driverChanged ? null : m.driverNID);
  await prisma.manifest.update({ where: { id: t.manifestId }, data });
}

/** العكس: تعديل السائق أو العربية على الكشف بيتنقل لرحلته. */
export async function copyManifestToTrip(prisma: PrismaService, manifestId: number) {
  const m = await prisma.manifest.findUnique({
    where: { id: manifestId },
    select: {
      driverName: true, vehicleNo: true, vehicleLabel: true, trailerNo: true, vehicleSource: true,
      driverTrips: { select: { id: true }, orderBy: { id: 'asc' }, take: 1 },
    },
  });
  const trip = m?.driverTrips[0];
  if (!m || !trip || m.vehicleSource !== 'OURS') return;
  const data: Record<string, string | null> = {};
  if (clean(m.driverName)) data.driverName = clean(m.driverName);
  if (clean(m.vehicleNo)) data.vehicleNo = clean(m.vehicleNo);
  if (clean(m.vehicleLabel)) data.vehicleLabel = clean(m.vehicleLabel);
  if (clean(m.trailerNo)) data.trailerNo = clean(m.trailerNo);
  if (Object.keys(data).length) await prisma.driverTrip.update({ where: { id: trip.id }, data });
}

/**
 * ربط الرحلة بفاتورة من ناحية كشف السائق بيوصل للكشف: الكشف اللي من غير
 * مستند (أو اللي كان على نفس المستند القديم) بياخد مستند الرحلة، وفك الرحلة
 * بيفك الكشف لو كان على نفس المستند. رحلة من غير كشف بتدوّر على كشف المستند.
 */
export async function syncTripDocToManifest(prisma: PrismaService, tripId: number, prev?: Doc) {
  const t = await prisma.driverTrip.findUnique({ where: { id: tripId }, select: { id: true, manifestId: true, invoiceId: true, dealId: true } });
  if (!t) return;
  if (t.manifestId == null) { await autoPairTrip(prisma, t.id); return; }
  const m = await prisma.manifest.findUnique({ where: { id: t.manifestId }, select: { invoiceId: true, dealId: true, vehicleSource: true } });
  if (!m || m.vehicleSource !== 'OURS') return;
  const onPrev = !!prev && (
    (prev.invoiceId != null && m.invoiceId === prev.invoiceId) || (prev.dealId != null && m.dealId === prev.dealId)
  );
  const mEmpty = m.invoiceId == null && m.dealId == null;
  if (t.invoiceId == null && t.dealId == null) {
    if (onPrev) await prisma.manifest.update({ where: { id: t.manifestId }, data: { invoiceId: null, dealId: null } });
    return;
  }
  if (mEmpty || onPrev) await prisma.manifest.update({ where: { id: t.manifestId }, data: { invoiceId: t.invoiceId, dealId: t.dealId } });
}
