import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { UpdateTransactionDto } from './dto/transactions.dto';

const TXN_INCLUDE = { party: true, treasury: true, treasury2: true, category: true, invoice: { select: { uid: true } }, deal: { select: { uid: true } } } as const;

@Injectable()
export class TransactionsRepository {
  constructor(private prisma: PrismaService) {}

  list(q: PaginationQueryDto) {
    const where: any = {};
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
    return this.prisma.transaction.create({ data });
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
    return this.prisma.transaction.findUniqueOrThrow({ where: { uid } });
  }

  updatePending(uid: string, partyUid: string, cashIn: number) {
    return this.prisma.transaction.update({
      where: { uid },
      data: {
        party: { connect: { uid: partyUid } },
        credit: cashIn,
        type: 'تحصيل',
        pending: false,
        expAmt: 0,
      },
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

      if (origDebit > 0) data.debit = amt;
      if (origCredit > 0) data.credit = amt;
      if (origCashIn > 0) data.cashIn = origCredit > 0 ? (amt / origCredit) * origCashIn : amt;
      if (origCashOut > 0) data.cashOut = origDebit > 0 ? (amt / origDebit) * origCashOut : amt;
    }

    return this.prisma.transaction.update({
      where: { uid: id },
      data,
      include: { party: true, treasury: true, treasury2: true, category: true },
    });
  }

  remove(id: string) {
    return this.prisma.transaction.delete({ where: { uid: id } });
  }
}
