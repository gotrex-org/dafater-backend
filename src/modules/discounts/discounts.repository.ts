import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { CreateDiscountDto } from './dto/discounts.dto';

const DISCOUNT_INCLUDE = { party: true } as const;

@Injectable()
export class DiscountsRepository {
  constructor(private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto) {
    const where: any = {};
    if (q.search) where.party = { name: { contains: q.search, mode: 'insensitive' } };
    if (q.from || q.to) where.date = {
      gte: q.from ? new Date(q.from) : undefined,
      lt: q.to ? new Date(new Date(q.to).getTime() + 86400000) : undefined,
    };
    return paginate(this.prisma.discount, q, {
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: DISCOUNT_INCLUDE,
    });
  }

  findByUid(id: string) {
    return this.prisma.discount.findUnique({ where: { uid: id }, select: { id: true } });
  }

  remove(id: string) {
    // linked transactions cascade-delete via Transaction.discountId
    return this.prisma.discount.delete({ where: { uid: id } });
  }

  async create(dto: CreateDiscountDto, createdById?: number) {
    const amount = dto.amount;
    return this.prisma.$transaction(async (tx) => {
      const party = await tx.party.findUniqueOrThrow({ where: { uid: dto.partyId }, select: { id: true, name: true, role: true } });
      const discount = await tx.discount.create({
        data: { date: new Date(dto.date), partyId: party.id, amount, note: dto.note ?? null },
      });
      // Supplier discount reduces what we owe them (debit); a client/other discount reduces
      // what they owe us (credit).
      const isSupplier = party.role === 'SUPPLIER';
      await tx.transaction.create({
        data: {
          date: new Date(dto.date),
          type: 'خصم',
          partyId: party.id,
          note: dto.note || `خصم على ${party.name}`,
          discountId: discount.id,
          ...(isSupplier ? { debit: amount } : { credit: amount }),
          ...(createdById ? { createdById } : {}),
        },
      });
      return tx.discount.findUnique({ where: { id: discount.id }, include: DISCOUNT_INCLUDE });
    });
  }
}
