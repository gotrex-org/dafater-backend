import { PrismaService } from '../prisma/prisma.service';

// حركات بين طرفين متسجّلة صفّين بنفس الـ groupId: الطرف الأول له (credit) والتاني
// عليه (debit) بنفس المبلغ. الحذف بيمسح الصفّين (transaction-cascade)، والتعديل لازم
// يمشي على الاتنين كمان وإلا الطرفين يختلفوا.
const PAIRED_PARTY_TYPES = ['تحويل بين أطراف', 'تسوية عهدة لعميل'];

/**
 * بعد تعديل حركة من كشف حساب طرف: لو هي رجل من تحويل بين أطراف، الرجل التانية
 * بتاخد نفس التاريخ ونفس المبلغ (على جنبها: له أو عليه). البيان مابيتنسخش لأن
 * كل رجل بيانها بيذكر الطرف التاني.
 */
export async function syncPairedPartyLeg(prisma: PrismaService, uid: string) {
  const t = await prisma.transaction.findUnique({
    where: { uid },
    select: { id: true, groupId: true, type: true, date: true, debit: true, credit: true },
  });
  if (!t?.groupId || !PAIRED_PARTY_TYPES.includes(t.type)) return;
  const amount = Number(t.debit) || Number(t.credit) || 0;
  if (amount <= 0) return;

  const legs = await prisma.transaction.findMany({
    where: { groupId: t.groupId, type: t.type, id: { not: t.id } },
    select: { id: true, debit: true },
  });
  if (!legs.length) return;
  await prisma.$transaction(legs.map((l) => prisma.transaction.update({
    where: { id: l.id },
    data: { date: t.date, ...(Number(l.debit) > 0 ? { debit: amount } : { credit: amount }) },
  })));
}
