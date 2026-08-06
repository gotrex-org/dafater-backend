import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWarehouseScheduleDto } from './dto/warehouse-expenses.dto';

const SCHEDULE_INCLUDE = { warehouse: { select: { uid: true, name: true } }, category: { select: { uid: true, name: true } } } as const;

// Every monthly occurrence (at `day`) from `start`'s month up to (and including) `now`.
// Clamp `day` to the month's length so a day like 31 never overflows into the next month
// (e.g. new Date(y, 1, 31) → Mar 3) which used to skip February entirely.
function monthlyOccurrences(start: Date, day: number, now: Date): Date[] {
  const out: Date[] = [];
  let y = start.getFullYear();
  let m = start.getMonth();
  while (out.length < 240) {
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const d = new Date(y, m, Math.min(day, daysInMonth));
    if (d.getTime() > now.getTime()) break;
    out.push(d);
    m += 1;
    if (m > 11) { m = 0; y += 1; }
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
        warehouse: dto.warehouseId ? { connect: { uid: dto.warehouseId } } : undefined,
        category: dto.categoryId ? { connect: { uid: dto.categoryId } } : undefined,
      },
      include: SCHEDULE_INCLUDE,
    });
  }

  removeSchedule(uid: string) {
    return this.prisma.warehouseExpenseSchedule.delete({ where: { uid } });
  }

  // Generate any due (and missed) monthly occurrences as OPEN "dues". Does NOT touch the
  // treasury — a due stays open until a user confirms it's paid (payDue). Idempotent via
  // the (scheduleId, period) unique key, so re-running never duplicates.
  async processDue(now = new Date()) {
    const schedules = await this.prisma.warehouseExpenseSchedule.findMany({ where: { active: true } });
    for (const s of schedules) {
      if (s.amount <= 0.0001) continue;
      const occs = monthlyOccurrences(new Date(s.createdAt), s.dayOfMonth, now);
      let lastKey = s.lastApplied ?? '';
      for (const occ of occs) {
        const key = `${occ.getFullYear()}-${String(occ.getMonth() + 1).padStart(2, '0')}`;
        if (lastKey && key <= lastKey) continue; // already generated
        await this.prisma.warehouseExpenseDue.upsert({
          where: { scheduleId_period: { scheduleId: s.id, period: key } },
          update: {},
          create: { scheduleId: s.id, period: key, title: s.title, amount: s.amount },
        });
        lastKey = key;
      }
      if (lastKey && lastKey !== (s.lastApplied ?? '')) {
        await this.prisma.warehouseExpenseSchedule.update({ where: { id: s.id }, data: { lastApplied: lastKey } });
      }
    }
  }

  listOpenDues() {
    return this.prisma.warehouseExpenseDue.findMany({
      where: { paid: false },
      orderBy: [{ period: 'asc' }, { createdAt: 'asc' }],
      include: { schedule: { select: { warehouse: { select: { name: true } }, category: { select: { name: true } } } } },
    });
  }

  countOpenDues() {
    return this.prisma.warehouseExpenseDue.count({ where: { paid: false } });
  }

  // Confirm a due is paid → post the "مصروف مخزن" cash-out from the chosen treasury and
  // mark the due paid. This is the only place a fixed bnud ever touches the treasury.
  async payDue(uid: string, treasuryUid: string, createdById?: number) {
    const due = await this.prisma.warehouseExpenseDue.findUnique({
      where: { uid },
      include: { schedule: { select: { warehouseId: true, categoryId: true } } },
    });
    if (!due) throw new NotFoundException('الاستحقاق غير موجود');
    if (due.paid) throw new BadRequestException('البند مدفوع بالفعل');
    const treasury = await this.prisma.treasuryAccount.findUniqueOrThrow({ where: { uid: treasuryUid }, select: { id: true } });

    return this.prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          date: new Date(), type: 'مصروف مخزن',
          cashOut: due.amount, note: `${due.title} (${due.period})`,
          warehouseId: due.schedule.warehouseId,
          treasuryId: treasury.id,
          ...(due.schedule.categoryId ? { categoryId: due.schedule.categoryId } : {}),
          ...(createdById ? { createdById } : {}),
        },
      });
      return tx.warehouseExpenseDue.update({ where: { id: due.id }, data: { paid: true, paidAt: new Date() } });
    });
  }
}
