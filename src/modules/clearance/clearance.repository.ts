import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** بيان الحركة في كشف الحساب — بيه بنميّز حركات التخليص عن أي حركة تانية. */
export const CLEARANCE_EXPENSE_TYPE = 'جمارك';
export const CLEARANCE_PAY_TYPE = 'سداد مخلّص';

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

  /** كل المخلّصين — الطرف بدور CLEARANCE. */
  listAgents() {
    return this.prisma.party.findMany({
      where: { role: 'CLEARANCE', hidden: false },
      select: { id: true, uid: true, name: true, phone: true, opening: true },
      orderBy: { name: 'asc' },
    });
  }

  /** حركات التخليص (مصاريف وسدادات) في فترة، مع العربية والمخلّص. */
  listMovements(where: { agentId?: number; from?: Date; to?: Date }) {
    return this.prisma.transaction.findMany({
      where: {
        type: { in: [CLEARANCE_EXPENSE_TYPE, CLEARANCE_PAY_TYPE] },
        ...(where.agentId ? { partyId: where.agentId } : {}),
        ...(where.from || where.to
          ? { date: { ...(where.from ? { gte: where.from } : {}), ...(where.to ? { lte: where.to } : {}) } }
          : {}),
      },
      include: {
        party: { select: { uid: true, name: true } },
        manifest: { select: { uid: true, no: true, date: true, clientName: true, vehicleLabel: true, vehicleNo: true } },
        category: { select: { uid: true, name: true } },
        treasury: { select: { uid: true, name: true } },
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
  }

  createMovement(data: {
    date: Date; type: string; partyId: number;
    debit?: number; credit?: number;
    cashOut?: number; treasuryId?: number;
    manifestId?: number; categoryId?: number;
    note?: string; createdById?: number;
  }) {
    const { debit = 0, credit = 0, cashOut = 0, ...rest } = data;
    return this.prisma.transaction.create({
      data: { ...rest, debit, credit, cashOut },
      include: {
        party: { select: { uid: true, name: true } },
        manifest: { select: { uid: true, no: true } },
      },
    });
  }

  findMovementByUid(uid: string) {
    return this.prisma.transaction.findUnique({ where: { uid } });
  }
}
