import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** أنواع حركات التصفية في حساب الاسم. */
export const LEDGER_TYPES = {
  capital: 'رأس مال تصفية',
  payment: 'سحب تصفية',
  // ثابتة: مستحق صنف — على تكلفة الصنف
  due: 'مستحق تصفية',
  // برأس المال: نصيبه من صافي ربح فاتورة (ممكن يبقى خسارة) — بيتخصم من صافي الربح
  share: 'نصيب تصفية',
} as const;

/** حركة مطلوبة في حساب الاسم — مربوطة بمصدرها في التصفية بمفتاح واحد بس. */
export interface LedgerRow {
  partnerItemId?: number;
  partnerCapitalId?: number;
  partnerPaymentId?: number;
  partnerVehicleId?: number;
  type: string;
  date: Date;
  treasuryId: number | null;
  debit: number;
  credit: number;
  cashIn: number;
  cashOut: number;
  expAmt: number;
  note: string;
  createdById: number | null;
}

const keyOf = (r: {
  partnerItemId?: number | null; partnerCapitalId?: number | null;
  partnerPaymentId?: number | null; partnerVehicleId?: number | null;
}) =>
  r.partnerItemId ? `i${r.partnerItemId}`
  : r.partnerCapitalId ? `c${r.partnerCapitalId}`
  : r.partnerVehicleId ? `v${r.partnerVehicleId}`
  : `p${r.partnerPaymentId}`;

const LINKED = {
  OR: [
    { partnerItemId: { not: null } }, { partnerCapitalId: { not: null } },
    { partnerPaymentId: { not: null } }, { partnerVehicleId: { not: null } },
  ],
};

/**
 * حساب اسم التصفية في البرنامج (بالطريقتين). الحركات هنا ظل لبيانات التصفية: بتتبني منها
 * (SettlementService.syncLedger) ومابتتكتبش بإيد — فالتعديل يتعمل من التصفية.
 */
@Injectable()
export class SettlementLedgerRepository {
  constructor(private prisma: PrismaService) {}

  /** خزنة بالجنيه بالـ uid — رأس المال والسحب بالجنيه فقط. */
  async egpTreasuryId(uid: string) {
    const t = await this.prisma.treasuryAccount.findUnique({ where: { uid }, select: { id: true, currency: true } });
    if (!t) throw new NotFoundException('الخزنة غير موجودة');
    if (t.currency !== 'EGP') throw new BadRequestException('اختر خزنة بالجنيه');
    return t.id;
  }

  createCapitalMovement(data: {
    partnerId: number; date: Date; amount: number; note: string | null;
    createdById: number | null; treasuryId: number | null;
  }) {
    return this.prisma.partnerCapitalMovement.create({ data });
  }

  createPayment(data: {
    partnerId: number; date: Date; amount: number; note: string | null;
    createdById: number | null; treasuryId: number | null;
  }) {
    return this.prisma.partnerPayment.create({ data });
  }

  capitalRows(partnerId: number) {
    return this.prisma.partnerCapitalMovement.findMany({
      where: { partnerId },
      select: { id: true, date: true, amount: true, note: true, treasuryId: true, createdById: true },
    });
  }

  paymentRows(partnerId: number) {
    return this.prisma.partnerPayment.findMany({
      where: { partnerId },
      select: { id: true, date: true, amount: true, note: true, treasuryId: true, createdById: true },
    });
  }

  /** حساب الاسم: موجود، وإلا يتعمل ويتربط. الاسم ورأس المال الافتتاحي بيتظبطوا كل مرة. */
  async ensureParty(partner: { id: number; name: string; partyId: number | null; capital: number }) {
    // الرصيد الافتتاحي بالسالب = له (opening موجب معناه عليه)
    const data = { name: partner.name, opening: -(partner.capital || 0) };
    if (partner.partyId) {
      await this.prisma.party.update({ where: { id: partner.partyId }, data });
      return partner.partyId;
    }
    const party = await this.prisma.party.create({ data: { ...data, role: 'PARTNER' } });
    await this.prisma.partner.update({ where: { id: partner.id }, data: { partyId: party.id } });
    return party.id;
  }

  /** الاسم مابقاش تصفية ثابتة: حسابه يرجع فاضي (الحساب نفسه بيفضل). */
  async clear(partyId: number) {
    await this.prisma.$transaction([
      this.prisma.transaction.deleteMany({ where: { partyId, ...LINKED } }),
      this.prisma.party.update({ where: { id: partyId }, data: { opening: 0 } }),
    ]);
  }

  /** حركات الحساب = المطلوب بالظبط: الناقص يتضاف، والمختلف يتعدّل، والزيادة تتمسح. */
  async apply(partyId: number, rows: LedgerRow[]) {
    const existing = await this.prisma.transaction.findMany({
      where: { partyId, ...LINKED },
      select: {
        id: true, partnerItemId: true, partnerCapitalId: true, partnerPaymentId: true, partnerVehicleId: true,
        type: true, date: true, treasuryId: true, debit: true, credit: true,
        cashIn: true, cashOut: true, expAmt: true, note: true,
      },
    });
    const have = new Map(existing.map((t) => [keyOf(t), t]));
    const want = new Map(rows.map((r) => [keyOf(r), r]));
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const [k, r] of want) {
      const t = have.get(k);
      const { createdById, ...fields } = r;
      if (!t) {
        ops.push(this.prisma.transaction.create({ data: { ...r, partyId } }));
        continue;
      }
      const same = t.type === r.type && t.date.getTime() === r.date.getTime() && t.treasuryId === r.treasuryId
        && t.debit === r.debit && t.credit === r.credit && t.cashIn === r.cashIn && t.cashOut === r.cashOut
        && t.expAmt === r.expAmt && t.note === r.note;
      if (!same) ops.push(this.prisma.transaction.update({ where: { id: t.id }, data: fields }));
    }
    const extra = existing.filter((t) => !want.has(keyOf(t))).map((t) => t.id);
    if (extra.length) ops.push(this.prisma.transaction.deleteMany({ where: { id: { in: extra } } }));
    if (ops.length) await this.prisma.$transaction(ops);
  }

  allPartners() {
    return this.prisma.partner.findMany({ select: { uid: true } });
  }

  async deleteParty(partyId: number) {
    await this.prisma.party.delete({ where: { id: partyId } });
  }
}
