import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate, pageParams, buildPage } from '../../common/pagination';
import { TreasuryDto } from './dto/treasury.dto';

@Injectable()
export class TreasuryRepository {
  constructor(private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto, allowedUids?: string[]) {
    return paginate(this.prisma.treasuryAccount, q, {
      ...(allowedUids ? { where: { uid: { in: allowedUids } } } : {}),
      orderBy: { name: 'asc' },
    });
  }

  findByUid(uid: string) {
    return this.prisma.treasuryAccount.findUnique({ where: { uid }, select: { id: true } });
  }

  async movements(q: PaginationQueryDto, allowedUids?: string[]) {
    const cashCondition = {
      OR: [
        { cashIn: { gt: 0 } }, { cashOut: { gt: 0 } },
        { cashIn2: { gt: 0 } }, { cashOut2: { gt: 0 } },
      ],
    };

    // A running balance only makes sense walked against ONE account's full history at a
    // time (mirrors the party ledger's own-balance-column pattern) — oldest-first to
    // accumulate correctly, then reverse for display. When filtered to a single treasury we
    // show every row touching it (both legs); when showing all treasuries merged we only
    // emit each row once, on its primary (`treasuryId`) side, to avoid double-listing
    // transfers that also appear in the other side's account history.
    if (q.treasuryId) {
      if (allowedUids && !allowedUids.includes(q.treasuryId)) {
        throw new ForbiddenException('غير مصرح لك بالاطلاع على هذه الخزينة');
      }
      const acc = await this.prisma.treasuryAccount.findUnique({ where: { uid: q.treasuryId } });
      const { all, page, pageSize, skip, take } = pageParams(q);
      if (!acc) return buildPage([], 0, page, pageSize);

      const withBalance = (await this.accountMovements(acc, cashCondition, false)).reverse();
      const data = all ? withBalance : withBalance.slice(skip, skip + take);
      return buildPage(data, withBalance.length, page, pageSize);
    }

    const accounts = await this.prisma.treasuryAccount.findMany();
    const perAccount = await Promise.all(accounts.map((acc) => this.accountMovements(acc, cashCondition, true)));
    let merged = perAccount.flat();

    if (allowedUids) {
      const allowedIds = new Set(accounts.filter((a) => allowedUids.includes(a.uid)).map((a) => a.id));
      merged = merged.filter((r) => allowedIds.has(r.treasuryId) || (r.treasuryId2 != null && allowedIds.has(r.treasuryId2)));
    }

    merged.sort((a, b) => {
      const d = new Date(b.date).getTime() - new Date(a.date).getTime();
      return d !== 0 ? d : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const { all, page, pageSize, skip, take } = pageParams(q);
    const data = all ? merged : merged.slice(skip, skip + take);
    return buildPage(data, merged.length, page, pageSize);
  }

  // Full running-balance history for one account, oldest→newest. `primaryOnly` restricts
  // emitted rows to this account's `treasuryId` side (used when merging multiple accounts'
  // histories into one feed, so a transfer isn't listed twice) — `running` still folds in
  // both legs regardless, so the account's own balance stays correct either way.
  private async accountMovements(acc: { id: number; opening: number }, cashCondition: any, primaryOnly: boolean) {
    const txns = await this.prisma.transaction.findMany({
      where: { AND: [cashCondition, { OR: [{ treasuryId: acc.id }, { treasuryId2: acc.id }] }] },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      // invoice/deal uids let the frontend deep-link a movement back to its source
      // document (the UidSerializer maps invoiceId/dealId → the related uid only when
      // the relation is included here).
      include: { treasury: true, treasury2: true, party: true, category: true, invoice: { select: { uid: true } }, deal: { select: { uid: true } } },
    });

    let running = acc.opening || 0;
    const rows: any[] = [];
    for (const t of txns) {
      if (t.treasuryId === acc.id) running += (t.cashIn || 0) - (t.cashOut || 0);
      if (t.treasuryId2 === acc.id) running += (t.cashIn2 || 0) - (t.cashOut2 || 0);
      if (!primaryOnly || t.treasuryId === acc.id) rows.push({ ...t, balance: running });
    }
    return rows;
  }

  async expensesByCategory() {
    const grouped = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { OR: [{ type: 'مصروف' }, { type: 'عمولة' }] },
      _sum: { cashOut: true, expAmt: true },
    });
    const cats = await this.prisma.expenseCategory.findMany();
    const byId = new Map(cats.map((c) => [c.id, c]));
    return grouped.map((g) => {
      const cat = g.categoryId == null ? undefined : byId.get(g.categoryId);
      return {
        categoryId: cat?.uid ?? null,
        category: cat?.name ?? 'غير محدد',
        total: (g._sum.cashOut || 0) + (g._sum.expAmt || 0),
      };
    });
  }

  create(dto: TreasuryDto) {
    return this.prisma.treasuryAccount.create({ data: dto });
  }

  update(id: string, dto: TreasuryDto) {
    return this.prisma.treasuryAccount.update({ where: { uid: id }, data: dto });
  }

  countRelatedTransactions(id: number) {
    return this.prisma.transaction.count({ where: { OR: [{ treasuryId: id }, { treasuryId2: id }] } });
  }

  removeCascade(id: number) {
    // Transaction.treasury(2) is onDelete: Cascade — deleting the account cascades
    // its transactions automatically. Invoices/deals/dollar-agent-tx referencing it
    // are onDelete: SetNull, so they survive with just the treasury link cleared.
    return this.prisma.treasuryAccount.delete({ where: { id } });
  }
}
