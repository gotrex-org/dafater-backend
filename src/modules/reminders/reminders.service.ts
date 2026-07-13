import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ReminderRecurrence } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReminderDto, UpdateReminderDto } from './dto/reminders.dto';

const MS_DAY = 86400000;
const ADVANCE_DAYS = 5; // notify this many days before the due date

@Injectable()
export class RemindersService {
  constructor(private prisma: PrismaService) {}

  private ymOf(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  // The occurrence currently in view for a reminder, and whether it's "due" — meaning it
  // falls within the 5-day advance window before its date (and stays due until marked done).
  // MONTHLY recurs every month on dayOfMonth; ONCE fires once on its date.
  private occurrence(r: any, now: Date): { target: Date | null; occKey: string; due: boolean } {
    const adv = ADVANCE_DAYS * MS_DAY;
    if (r.recurrence === ReminderRecurrence.ONCE) {
      if (!r.date) return { target: null, occKey: 'once', due: false };
      const target = new Date(r.date);
      return { target, occKey: 'once', due: !r.doneAt && now.getTime() >= target.getTime() - adv };
    }
    const day = Math.min(Math.max(r.dayOfMonth || 1, 1), 28);
    const thisTarget = new Date(now.getFullYear(), now.getMonth(), day);
    const thisYM = this.ymOf(thisTarget);
    if (r.doneMonth !== thisYM) {
      return { target: thisTarget, occKey: thisYM, due: now.getTime() >= thisTarget.getTime() - adv };
    }
    // This month is already done — look ahead to next month's occurrence (so an early-day
    // reminder can still warn 5 days before, near the end of this month).
    const nextTarget = new Date(now.getFullYear(), now.getMonth() + 1, day);
    return { target: nextTarget, occKey: this.ymOf(nextTarget), due: now.getTime() >= nextTarget.getTime() - adv };
  }

  private computed(r: any, now: Date) {
    const occ = this.occurrence(r, now);
    const nextDate = occ.target ? occ.target.toISOString().slice(0, 10) : null;
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const daysUntil = occ.target
      ? Math.round((new Date(occ.target.getFullYear(), occ.target.getMonth(), occ.target.getDate()).getTime() - startToday) / MS_DAY)
      : null;
    return { ...r, due: occ.due, nextDate, daysUntil };
  }

  async findAll(ownerId: number) {
    const now = new Date();
    const rows = await this.prisma.reminder.findMany({
      where: { ownerId },
      orderBy: [{ createdAt: 'desc' }],
    });
    const list = rows.map((r) => this.computed(r, now));
    // due first, then by nextDate
    list.sort((a, b) => Number(b.due) - Number(a.due) || (a.nextDate || '').localeCompare(b.nextDate || ''));
    return list;
  }

  async dueCount(ownerId: number) {
    const list = await this.findAll(ownerId);
    return { count: list.filter((r) => r.due).length };
  }

  create(ownerId: number, dto: CreateReminderDto) {
    return this.prisma.reminder.create({
      data: {
        ownerId,
        title: dto.title,
        kind: dto.kind,
        amount: dto.amount ?? 0,
        recurrence: dto.recurrence,
        dayOfMonth: dto.recurrence === ReminderRecurrence.MONTHLY ? dto.dayOfMonth ?? 1 : null,
        date: dto.recurrence === ReminderRecurrence.ONCE && dto.date ? new Date(dto.date) : null,
        note: dto.note ?? null,
      },
    });
  }

  private async own(uid: string, ownerId: number) {
    const r = await this.prisma.reminder.findUnique({ where: { uid } });
    if (!r) throw new NotFoundException('Reminder not found');
    if (r.ownerId !== ownerId) throw new ForbiddenException('غير مصرح لك');
    return r;
  }

  async update(uid: string, ownerId: number, dto: UpdateReminderDto) {
    await this.own(uid, ownerId);
    return this.prisma.reminder.update({
      where: { uid },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.recurrence !== undefined ? { recurrence: dto.recurrence } : {}),
        ...(dto.dayOfMonth !== undefined ? { dayOfMonth: dto.dayOfMonth } : {}),
        ...(dto.date !== undefined ? { date: dto.date ? new Date(dto.date) : null } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
      },
    });
  }

  // Mark done for the occurrence currently in view: ONCE → doneAt; MONTHLY → that month is
  // done (recurs next month).
  async markDone(uid: string, ownerId: number) {
    const r = await this.own(uid, ownerId);
    const now = new Date();
    if (r.recurrence === ReminderRecurrence.ONCE) {
      return this.prisma.reminder.update({ where: { uid }, data: { doneAt: now } });
    }
    const occ = this.occurrence(r, now);
    return this.prisma.reminder.update({ where: { uid }, data: { doneMonth: occ.occKey } });
  }

  // Undo the done state (re-activate).
  async undo(uid: string, ownerId: number) {
    await this.own(uid, ownerId);
    return this.prisma.reminder.update({ where: { uid }, data: { doneAt: null, doneMonth: null } });
  }

  async remove(uid: string, ownerId: number) {
    await this.own(uid, ownerId);
    return this.prisma.reminder.delete({ where: { uid } });
  }
}
