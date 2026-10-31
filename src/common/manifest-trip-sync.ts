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
