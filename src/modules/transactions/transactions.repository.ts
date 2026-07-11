import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { deleteTransactionAndEffects } from '../../common/transaction-cascade';
import { UpdateTransactionDto } from './dto/transactions.dto';

const TXN_INCLUDE = { party: true, treasury: true, treasury2: true, category: true, invoice: { select: { uid: true } }, deal: { select: { uid: true } }, createdBy: { select: { name: true } } } as const;

@Injectable()
export class TransactionsRepository {
  constructor(private prisma: PrismaService) {}

  list(q: PaginationQueryDto, createdByIntId?: number) {
    const where: any = {};
    if (createdByIntId) where.createdById = createdByIntId;
    if (q.from || q.to) where.date = {
      gte: q.from ? new Date(q.from) : undefined,
      lt: q.to ? new Date(new Date(q.to).getTime() + 86400000) : undefined,
    };
    if (q.search) where.OR = [
      { type: { contains: q.search, mode: 'insensitive' } },
      { note: { contains: q.search, mode: 'insensitive' } },
      { party: { name: { contains: q.search, mode: 'insensitive' } } },
    ];
    return paginate(this.prisma.transaction, q, {
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: TXN_INCLUDE,
    });
  }

  create(data: any) {
    return this.prisma.transaction.create({ data, include: TXN_INCLUDE });
  }

  createMany(data: any[]) {
    return this.prisma.transaction.createMany({ data });
  }

  findPartyByUid(uid: string) {
    return this.prisma.party.findUniqueOrThrow({ where: { uid }, select: { id: true, name: true } });
  }

  findTreasuryByUid(uid: string) {
    return this.prisma.treasuryAccount.findUniqueOrThrow({ where: { uid }, select: { id: true } });
  }

  pendingList() {
    return this.prisma.transaction.findMany({
      where: { pending: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { treasury: true },
    });
  }

  findByUid(uid: string) {
    return this.prisma.transaction.findUniqueOrThrow({ where: { uid }, include: TXN_INCLUDE });
  }

  updatePending(uid: string, partyUid: string, cashIn: number, groupId?: string) {
    return this.prisma.transaction.update({
      where: { uid },
      data: {
        party: { connect: { uid: partyUid } },
        credit: cashIn,
        type: 'تحصيل',
        pending: false,
        expAmt: 0,
        ...(groupId ? { groupId } : {}),
      },
      include: TXN_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateTransactionDto) {
    const txn = await this.prisma.transaction.findUniqueOrThrow({ where: { uid: id } });
    const data: any = {};

    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.note !== undefined) data.note = dto.note;

    if (dto.partyId !== undefined) {
      if (dto.partyId) {
        const party = await this.prisma.party.findUniqueOrThrow({ where: { uid: dto.partyId }, select: { id: true } });
        data.partyId = party.id;
      } else {
        data.partyId = null;
      }
    }

    if (dto.treasuryId !== undefined) {
      if (dto.treasuryId) {
        const treasury = await this.prisma.treasuryAccount.findUniqueOrThrow({ where: { uid: dto.treasuryId }, select: { id: true } });
        data.treasuryId = treasury.id;
      } else {
        data.treasuryId = null;
      }
    }

    if (dto.amount !== undefined && dto.amount > 0) {
      const amt = dto.amount;
      const origDebit = Number(txn.debit) || 0;
      const origCredit = Number(txn.credit) || 0;
      const origCashIn = Number(txn.cashIn) || 0;
      const origCashOut = Number(txn.cashOut) || 0;
      const origCashIn2 = Number(txn.cashIn2) || 0;
      const origCashOut2 = Number(txn.cashOut2) || 0;

      if (origDebit > 0) data.debit = amt;
      if (origCredit > 0) data.credit = amt;
      if (origCashIn > 0) data.cashIn = origCredit > 0 ? (amt / origCredit) * origCashIn : amt;
      if (origCashOut > 0) data.cashOut = origDebit > 0 ? (amt / origDebit) * origCashOut : amt;

      // A treasury→treasury transfer is a single row: the "from" side is cashOut/cashIn on
      // `treasury`, the "to" side is cashIn2/cashOut2 on `treasury2`. Editing the amount must
      // move BOTH treasuries — scale the second leg by the same ratio as the edited amount so
      // any currency-transfer rate is preserved (and same-currency stays equal on both sides).
      const base = origCashOut || origCashIn || origDebit || origCredit || 0;
      if (origCashIn2 > 0) data.cashIn2 = base > 0 ? (amt / base) * origCashIn2 : amt;
      if (origCashOut2 > 0) data.cashOut2 = base > 0 ? (amt / base) * origCashOut2 : amt;
    }

    const updated = await this.prisma.transaction.update({
      where: { uid: id },
      data,
      include: { party: true, treasury: true, treasury2: true, category: true },
    });

    // Keep DriverTrip.weightDiffAmount in sync when the party-debit transaction is edited
    if (txn.type === 'truckWeightDiff' && data.debit !== undefined) {
      await this.prisma.driverTrip.updateMany({
        where: { weightDiffTxId: txn.id },
        data: { weightDiffAmount: data.debit },
      });
    }

    return updated;
  }

  async remove(id: string) {
    const txn = await this.prisma.transaction.findUniqueOrThrow({ where: { uid: id } });
    await deleteTransactionAndEffects(this.prisma, txn.id);
    return txn;
  }
}
