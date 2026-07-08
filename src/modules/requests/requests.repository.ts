import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { CreateRequestDto, ReceiveDto } from './dto/requests.dto';

@Injectable()
export class RequestsRepository {
  constructor(private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto, done?: boolean, clientId?: string) {
    const where: any = {};
    if (done !== undefined) where.done = done;
    if (clientId) where.client = { uid: clientId };
    return paginate(this.prisma.request, q, {
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { client: true, items: true },
    });
  }

  create(dto: CreateRequestDto) {
    return this.prisma.request.create({
      data: {
        date: new Date(dto.date), note: dto.note,
        client: { connect: { uid: dto.clientId } },
        items: { create: dto.items },
      },
      include: { items: true, client: true },
    });
  }

  markDone(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const req = await tx.request.findUniqueOrThrow({ where: { uid: id }, include: { items: true } });
      for (const it of req.items) {
        if ((it.received ?? 0) < it.qty) await tx.requestItem.update({ where: { id: it.id }, data: { received: it.qty } });
      }
      return tx.request.update({ where: { id: req.id }, data: { done: true, doneDate: new Date() } });
    });
  }

  receive(id: string, dto: ReceiveDto) {
    return this.prisma.$transaction(async (tx) => {
      const req = await tx.request.findUniqueOrThrow({ where: { uid: id }, select: { id: true } });
      for (const it of dto.items) {
        await tx.requestItem.update({ where: { uid: it.id }, data: { received: Math.max(0, it.received) } });
      }
      const items = await tx.requestItem.findMany({ where: { requestId: req.id } });
      const allReceived = items.length > 0 && items.every((i) => (i.received ?? 0) >= i.qty);
      if (allReceived) await tx.request.update({ where: { id: req.id }, data: { done: true, doneDate: new Date() } });
      return tx.request.findUnique({ where: { id: req.id }, include: { items: true, client: true } });
    });
  }

  remove(id: string) {
    return this.prisma.request.delete({ where: { uid: id } });
  }
}
