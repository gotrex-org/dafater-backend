import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BalancesService } from '../balances/balances.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { TreasuryDto } from './dto/treasury.dto';

@Injectable()
export class TreasuryService {
  constructor(
    private prisma: PrismaService,
    private balances: BalancesService,
  ) {}

  async findAll(q: PaginationQueryDto) {
    const result = await paginate(this.prisma.treasuryAccount, q, { orderBy: { createdAt: 'asc' } });
    result.data = await Promise.all(
      result.data.map(async (a: any) => ({ ...a, balance: await this.balances.treasuryBalance(a.id) })),
    );
    return result;
  }

  /** all cash movements across accounts */
  movements(q: PaginationQueryDto) {
    return paginate(this.prisma.transaction, q, {
      where: {
        OR: [
          { cashIn: { gt: 0 } }, { cashOut: { gt: 0 } },
          { cashIn2: { gt: 0 } }, { cashOut2: { gt: 0 } },
        ],
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { treasury: true, treasury2: true, party: true, category: true },
    });
  }

  /** expenses grouped by category */
  async expensesByCategory() {
    const grouped = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { OR: [{ type: 'مصروف' }, { type: 'عمولة' }] },
      _sum: { cashOut: true, expAmt: true },
    });
    const cats = await this.prisma.expenseCategory.findMany();
    // transaction.categoryId is the category's integer id; expose its uid
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
  remove(id: string) {
    return this.prisma.treasuryAccount.delete({ where: { uid: id } });
  }
}
