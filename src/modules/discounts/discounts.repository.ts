import { Injectable } from '@nestjs/common';
import { DiscountRecurrence } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { CreateDiscountDto, CreateDiscountScheduleDto } from './dto/discounts.dto';

const DISCOUNT_INCLUDE = { party: true } as const;
const stepOf = (r: DiscountRecurrence) => (r === 'MONTHLY' ? 1 : r === 'QUARTERLY' ? 3 : 12);

// Every occurrence date from startDate up to (and including) `now`.
function occurrencesUpTo(start: Date, r: DiscountRecurrence, now: Date): Date[] {
  const step = stepOf(r);
  const out: Date[] = [];
  const d = new Date(start);
  while (d.getTime() <= now.getTime() && out.length < 240) {
    out.push(new Date(d));
    d.setMonth(d.getMonth() + step);
  }
  return out;
}

@Injectable()
export class DiscountsRepository {
  constructor(private prisma: PrismaService) {}

  // ── recurring schedules ──
  listSchedules() {
    return this.prisma.discountSchedule.findMany({
      orderBy: [{ createdAt: 'desc' }],
      include: { party: true },
    });
  }

  createSchedule(dto: CreateDiscountScheduleDto) {
    return this.prisma.discountSchedule.create({
      data: {
        amount: dto.amount ?? 0,
        percent: dto.percent ?? 0,
        cartons: dto.cartons ?? 0,
        cartonPrice: dto.cartonPrice ?? 0,
        recurrence: dto.recurrence,
        startDate: new Date(dto.startDate),
        note: dto.note ?? null,
        party: { connect: { uid: dto.partyId } },
      },
      include: { party: true },
    });
  }

  removeSchedule(uid: string) {
    return this.prisma.discountSchedule.delete({ where: { uid } });
  }

  // Net purchases (invoice items) from a party between [from, to), excluding fake invoices.
  private async purchasesFrom(partyId: number, from: Date, to: Date): Promise<number> {
    const items = await this.prisma.invoiceItem.findMany({
      where: { invoice: { partyId, kind: 'PURCHASE', fake: false, date: { gte: from, lt: to } } },
      select: { qty: true, price: true },
    });
    return items.reduce((s, it) => s + it.qty * it.price, 0);
  }

  // Apply any due (and missed) occurrences of every active schedule. Idempotent: keyed by
  // lastApplied so re-running doesn't double-apply.
  async processDue(now = new Date()) {
    const schedules = await this.prisma.discountSchedule.findMany({
      where: { active: true },
      include: { party: { select: { id: true, name: true, role: true } } },
    });
    for (const s of schedules) {
      const occs = occurrencesUpTo(new Date(s.startDate), s.recurrence, now);
      const step = stepOf(s.recurrence);
      let lastKey = s.lastApplied ?? '';
      for (const occ of occs) {
        const key = occ.toISOString().slice(0, 10);
        if (lastKey && key <= lastKey) continue; // already applied
        let amount = s.amount;
        if (s.cartons > 0) {
          amount = s.cartons * s.cartonPrice;
        } else if (s.percent > 0) {
          const prev = new Date(occ);
          prev.setMonth(prev.getMonth() - step);
          const base = await this.purchasesFrom(s.partyId, prev, occ);
          amount = (base * s.percent) / 100;
        }
        if (amount > 0.0001) {
          const isSupplier = s.party.role === 'SUPPLIER';
          const discount = await this.prisma.discount.create({
            data: { date: occ, partyId: s.partyId, amount, note: s.note || `خصم دوري على ${s.party.name}`, scheduleId: s.id },
          });
          await this.prisma.transaction.create({
            data: {
              date: occ, type: 'خصم', partyId: s.partyId,
              note: s.note || `خصم دوري على ${s.party.name}`, discountId: discount.id,
              ...(isSupplier ? { debit: amount } : { credit: amount }),
            },
          });
        }
        lastKey = key;
      }
      if (lastKey && lastKey !== (s.lastApplied ?? '')) {
        await this.prisma.discountSchedule.update({ where: { id: s.id }, data: { lastApplied: lastKey } });
      }
    }
  }

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
    // Resolve the discount value: cash amount, cartons×price, or % of this month's purchases.
    const base = await this.prisma.party.findUniqueOrThrow({ where: { uid: dto.partyId }, select: { id: true } });
    let amount = dto.amount ?? 0;
    if (dto.percent && dto.percent > 0) {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      amount = ((await this.purchasesFrom(base.id, from, to)) * dto.percent) / 100;
    } else if (dto.cartons && dto.cartons > 0) {
      amount = dto.cartons * (dto.cartonPrice ?? 0);
    }
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
