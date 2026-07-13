import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ReminderRecurrence } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReminderDto, UpdateReminderDto } from './dto/reminders.dto';

const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

@Injectable()
export class RemindersService {
  constructor(private prisma: PrismaService) {}

  // A reminder is "due" when its day has arrived and it hasn't been marked done for the
  // current cycle. MONTHLY recurs every month on dayOfMonth; ONCE fires on/after its date.
  private computed(r: any, now: Date) {
    let due = false;
    let nextDate: string | null = null;
    if (r.recurrence === ReminderRecurrence.ONCE) {
      due = !r.doneAt && !!r.date && new Date(r.date) <= now;
      nextDate = r.date ? new Date(r.date).toISOString().slice(0, 10) : null;
    } else {
      const day = Math.min(Math.max(r.dayOfMonth || 1, 1), 28);
      const doneThisMonth = r.doneMonth === ym(now);
      due = !doneThisMonth && now.getDate() >= day;
      // next occurrence: this month's day if not passed/not done, else next month's
      const base = new Date(now.getFullYear(), now.getMonth(), day);
      const target = doneThisMonth || now.getDate() > day ? new Date(now.getFullYear(), now.getMonth() + 1, day) : base;
      nextDate = target.toISOString().slice(0, 10);
    }
    return { ...r, due, nextDate };
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

  // Mark done for the current cycle: ONCE → doneAt; MONTHLY → this month is done (recurs next month).
  async markDone(uid: string, ownerId: number) {
    const r = await this.own(uid, ownerId);
    const now = new Date();
    return this.prisma.reminder.update({
      where: { uid },
      data: r.recurrence === ReminderRecurrence.ONCE ? { doneAt: now } : { doneMonth: ym(now) },
    });
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
