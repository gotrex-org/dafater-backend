import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
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
    const andConditions: any[] = [cashCondition];
    if (q.treasuryId) {
      if (allowedUids && !allowedUids.includes(q.treasuryId)) {
        throw new ForbiddenException('غير مصرح لك بالاطلاع على هذه الخزينة');
      }
      const acc = await this.prisma.treasuryAccount.findUnique({ where: { uid: q.treasuryId }, select: { id: true } });
      if (acc) andConditions.push({ OR: [{ treasuryId: acc.id }, { treasuryId2: acc.id }] });
    } else if (allowedUids) {
      const accs = await this.prisma.treasuryAccount.findMany({ where: { uid: { in: allowedUids } }, select: { id: true } });
      const ids = accs.map((a) => a.id);
      andConditions.push({ OR: [{ treasuryId: { in: ids } }, { treasuryId2: { in: ids } }] });
    }
    return paginate(this.prisma.transaction, q, {
      where: andConditions.length === 1 ? andConditions[0] : { AND: andConditions },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { treasury: true, treasury2: true, party: true, category: true },
    });
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

  remove(id: string) {
    return this.prisma.treasuryAccount.delete({ where: { uid: id } });
  }
}
