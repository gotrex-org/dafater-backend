import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OwnerEntryKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOwnerEntryDto, UpdateOwnerEntryDto } from './dto/finance.dto';

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  private range(from?: string, to?: string) {
    if (!from && !to) return undefined;
    return {
      gte: from ? new Date(from) : undefined,
      lt: to ? new Date(new Date(to).getTime() + 86400000) : undefined,
    };
  }

  // All of an owner's private entries in the period, plus totals per kind (net = amount - discount).
  async findAll(ownerId: number, from?: string, to?: string) {
    const date = this.range(from, to);
    const rows = await this.prisma.ownerEntry.findMany({
      where: { ownerId, ...(date ? { date } : {}) },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    const totals: Record<string, { amount: number; discount: number; net: number; count: number }> = {};
    for (const k of Object.values(OwnerEntryKind)) totals[k] = { amount: 0, discount: 0, net: 0, count: 0 };
    for (const r of rows) {
      const t = totals[r.kind];
      t.amount += r.amount;
      t.discount += r.discount;
      t.net += r.amount - r.discount;
      t.count += 1;
    }
    return { entries: rows, totals };
  }

  create(ownerId: number, dto: CreateOwnerEntryDto) {
    return this.prisma.ownerEntry.create({
      data: {
        ownerId,
        kind: dto.kind,
        title: dto.title,
        amount: dto.amount,
        discount: dto.discount ?? 0,
        date: new Date(dto.date),
        note: dto.note ?? null,
      },
    });
  }

  private async own(uid: string, ownerId: number) {
    const r = await this.prisma.ownerEntry.findUnique({ where: { uid } });
    if (!r) throw new NotFoundException('Entry not found');
    if (r.ownerId !== ownerId) throw new ForbiddenException('غير مصرح لك');
    return r;
  }

  async update(uid: string, ownerId: number, dto: UpdateOwnerEntryDto) {
    await this.own(uid, ownerId);
    return this.prisma.ownerEntry.update({
      where: { uid },
      data: {
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.discount !== undefined ? { discount: dto.discount } : {}),
        ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
      },
    });
  }

  async remove(uid: string, ownerId: number) {
    await this.own(uid, ownerId);
    return this.prisma.ownerEntry.delete({ where: { uid } });
  }
}
