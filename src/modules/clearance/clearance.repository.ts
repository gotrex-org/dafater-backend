import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** بيان الحركة في كشف الحساب — بيه بنميّز حركات التخليص عن أي حركة تانية. */
export const CLEARANCE_EXPENSE_TYPE = 'جمارك';
export const CLEARANCE_PAY_TYPE = 'سداد مخلّص';

const MOVEMENT_INCLUDE = {
  party: { select: { uid: true, name: true, role: true } },
  clearanceAgent: { select: { uid: true, name: true } },
  manifest: {
    select: {
      uid: true, no: true, date: true, clientName: true,
      vehicleLabel: true, vehicleNo: true, trailerNo: true,
    },
  },
  category: { select: { uid: true, name: true } },
  treasury: { select: { uid: true, name: true, currency: true } },
} as const;

export type MovementData = {
  date: Date; type: string; partyId: number; clearanceAgentId: number;
  debit?: number; credit?: number;
  cashOut?: number; treasuryId?: number;
  manifestId?: number; categoryId?: number;
  exchangeRate?: number; groupId?: string;
  note?: string; createdById?: number;
};

@Injectable()
export class ClearanceRepository {
  constructor(private prisma: PrismaService) {}

  findManifestByUid(uid: string) {
    return this.prisma.manifest.findUnique({ where: { uid } });
  }

  findPartyByUid(uid: string) {
    return this.prisma.party.findUnique({ where: { uid } });
  }

  findTreasuryByUid(uid: string) {
    return this.prisma.treasuryAccount.findUnique({ where: { uid } });
  }

  findCategoryByUid(uid: string) {
    return this.prisma.expenseCategory.findUnique({ where: { uid } });
  }

  /** مكاتب التخليص — الطرف بدور CLEARANCE. المؤرشفة بس لما تتطلب. */
  listAgents(includeArchived = false) {
    return this.prisma.party.findMany({
      where: { role: 'CLEARANCE', ...(includeArchived ? {} : { hidden: false }) },
      select: {
        id: true, uid: true, name: true, phone: true, note: true, opening: true, hidden: true,
        clearanceSupplier: { select: { uid: true, name: true } },
      },
      orderBy: [{ hidden: 'asc' }, { name: 'asc' }],
    });
  }

  createAgent(data: { name: string; phone: string | null; note: string | null; clearanceSupplierId: number | null }) {
    return this.prisma.party.create({
      data: { ...data, role: 'CLEARANCE', type: 'LEDGER' },
      select: { uid: true, name: true, phone: true, note: true, hidden: true, clearanceSupplier: { select: { uid: true, name: true } } },
    });
  }

  updateAgent(id: number, data: { name?: string; phone?: string | null; note?: string | null; hidden?: boolean; clearanceSupplierId?: number | null }) {
    return this.prisma.party.update({
      where: { id },
      data,
      select: { uid: true, name: true, phone: true, note: true, hidden: true, clearanceSupplier: { select: { uid: true, name: true } } },
    });
  }

  /** ارتباطات المكتب اللي بتمنع حذفه — أي حركة على حسابه أو باسمه على حساب المورد. */
  countAgentTransactions(partyId: number) {
    return this.prisma.transaction.count({ where: ofAgent(partyId) });
  }

  deleteAgent(id: number) {
    return this.prisma.party.delete({ where: { id } });
  }

  /**
   * صافي (عليه − له) لكل مكتب من كل حركاته — من غير الرصيد الافتتاحي. الحركة
   * المرحّلة على المورد تُحسب للمكتب صاحبها (clearanceAgentId).
   */
  async netByParty(partyIds: number[]) {
    if (!partyIds.length) return new Map<number, number>();
    const ids = new Set(partyIds);
    const agg = await this.prisma.transaction.groupBy({
      by: ['partyId', 'clearanceAgentId'],
      where: { OR: [{ partyId: { in: partyIds } }, { clearanceAgentId: { in: partyIds } }] },
      _sum: { debit: true, credit: true },
    });
    const net = new Map<number, number>();
    for (const a of agg) {
      const id = a.clearanceAgentId && ids.has(a.clearanceAgentId) ? a.clearanceAgentId : (a.partyId as number);
      net.set(id, (net.get(id) ?? 0) + (a._sum.debit || 0) - (a._sum.credit || 0));
    }
    return net;
  }

  /** صافي (عليه − له) لمكتب قبل تاريخ — الرصيد المرحّل في أول كشف الحساب. */
  async netBefore(partyId: number, before: Date) {
    const agg = await this.prisma.transaction.aggregate({
      where: { ...ofAgent(partyId), date: { lt: before } },
      _sum: { debit: true, credit: true },
    });
    return (agg._sum.debit || 0) - (agg._sum.credit || 0);
  }
  /** حركات التخليص (مصاريف ودفعات) في فترة، مع العربية والمكتب. */
  listMovements(where: { agentId?: number; from?: Date; to?: Date }) {
    return this.prisma.transaction.findMany({
      where: {
        type: { in: [CLEARANCE_EXPENSE_TYPE, CLEARANCE_PAY_TYPE] },
        ...(where.agentId ? ofAgent(where.agentId) : {}),
        ...dateRange(where.from, where.to),
      },
      include: MOVEMENT_INCLUDE,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
  }

  /** كل حركات حساب المكتب في فترة (أي نوع) — أقدم أولاً عشان الرصيد التراكمي. */
  statementRows(partyId: number, from?: Date, to?: Date) {
    return this.prisma.transaction.findMany({
      where: { ...ofAgent(partyId), ...dateRange(from, to) },
      include: MOVEMENT_INCLUDE,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  createMovement(data: MovementData) {
    return this.prisma.transaction.create({ data: toRow(data), include: MOVEMENT_INCLUDE });
  }

  /** رجلين مع بعض أو ولا واحدة (التخليص النقدي: مصروف + دفعة). */
  createMovements(rows: MovementData[]) {
    return this.prisma.$transaction(
      rows.map((r) => this.prisma.transaction.create({ data: toRow(r), include: MOVEMENT_INCLUDE })),
    );
  }

  findMovementByUid(uid: string) {
    return this.prisma.transaction.findUnique({ where: { uid } });
  }

  findGroup(groupId: string) {
    return this.prisma.transaction.findMany({ where: { groupId } });
  }

  /** تعديل أكتر من رجل في نفس الوقت (ذرّي). */
  updateMovements(updates: { id: number; data: Prisma.TransactionUncheckedUpdateInput }[]) {
    return this.prisma.$transaction(
      updates.map((u) => this.prisma.transaction.update({ where: { id: u.id }, data: u.data, include: MOVEMENT_INCLUDE })),
    );
  }
}

function toRow(data: MovementData): Prisma.TransactionUncheckedCreateInput {
  const { debit = 0, credit = 0, cashOut = 0, ...rest } = data;
  // كل حركات التخليص نشاطها شحن.
  return { ...rest, debit, credit, cashOut, activity: 'SHIPPING' };
}

// حركات المكتب: على حسابه، أو باسمه على حساب المورد المربوط به.
function ofAgent(id: number): Prisma.TransactionWhereInput {
  return { OR: [{ partyId: id }, { clearanceAgentId: id }] };
}

// `to` شامل اليوم كله — نفس منطق باقي الشاشات.
function dateRange(from?: Date, to?: Date) {
  if (!from && !to) return {};
  return {
    date: {
      ...(from ? { gte: from } : {}),
      ...(to ? { lt: new Date(to.getTime() + 86400000) } : {}),
    },
  };
}
