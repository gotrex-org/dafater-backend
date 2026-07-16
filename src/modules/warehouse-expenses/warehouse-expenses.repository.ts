import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWarehouseScheduleDto } from './dto/warehouse-expenses.dto';

const SCHEDULE_INCLUDE = { warehouse: { select: { uid: true, name: true } }, treasury: { select: { uid: true, name: true } }, category: { select: { uid: true, name: true } } } as const;

// Every monthly occurrence (at `day`) from `start`'s month up to (and including) `now`.
function monthlyOccurrences(start: Date, day: number, now: Date): Date[] {
  const out: Date[] = [];
  const d = new Date(start.getFullYear(), start.getMonth(), day);
  while (d.getTime() <= now.getTime() && out.length < 240) {
    out.push(new Date(d));
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

@Injectable()
export class WarehouseExpensesRepository {
  constructor(private prisma: PrismaService) {}

  listSchedules() {
    return this.prisma.warehouseExpenseSchedule.findMany({
      orderBy: [{ createdAt: 'desc' }],
      include: SCHEDULE_INCLUDE,
    });
  }

  async createSchedule(dto: CreateWarehouseScheduleDto) {
    return this.prisma.warehouseExpenseSchedule.create({
      data: {
        title: dto.title,
        amount: dto.amount,
        dayOfMonth: dto.dayOfMonth ?? 1,
        active: dto.active ?? true,
        warehouse: { connect: { uid: dto.warehouseId } },
        treasury: dto.treasuryId ? { connect: { uid: dto.treasuryId } } : undefined,
        category: dto.categoryId ? { connect: { uid: dto.categoryId } } : undefined,
      },
      include: SCHEDULE_INCLUDE,
    });
  }

  removeSchedule(uid: string) {
    return this.prisma.warehouseExpenseSchedule.delete({ where: { uid } });
  }

  // Apply any due (and missed) monthly occurrences of every active schedule. Idempotent:
  // keyed by lastApplied ("YYYY-MM") so re-running doesn't double-post.
  async processDue(now = new Date()) {
    const schedules = await this.prisma.warehouseExpenseSchedule.findMany({ where: { active: true } });
    for (const s of schedules) {
      const occs = monthlyOccurrences(new Date(s.createdAt), s.dayOfMonth, now);
      let lastKey = s.lastApplied ?? '';
      for (const occ of occs) {
        const key = `${occ.getFullYear()}-${String(occ.getMonth() + 1).padStart(2, '0')}`;
        if (lastKey && key <= lastKey) continue; // already applied
        if (s.amount > 0.0001) {
          await this.prisma.transaction.create({
            data: {
              date: occ, type: 'مصروف مخزن',
              cashOut: s.amount,
              note: s.title,
              warehouseId: s.warehouseId,
              ...(s.treasuryId ? { treasuryId: s.treasuryId } : {}),
              ...(s.categoryId ? { categoryId: s.categoryId } : {}),
            },
          });
        }
        lastKey = key;
      }
      if (lastKey && lastKey !== (s.lastApplied ?? '')) {
        await this.prisma.warehouseExpenseSchedule.update({ where: { id: s.id }, data: { lastApplied: lastKey } });
      }
    }
  }
}
