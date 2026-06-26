import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { CreateOrderDto, UpdateOrderDto, ReceiveOrderDto } from './dto/orders.dto';

@Injectable()
export class OrdersRepository {
  constructor(private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto, done?: boolean) {
    const where: any = {};
    if (done !== undefined) where.status = done ? OrderStatus.DONE : OrderStatus.NEW;
    if (q.search) where.OR = [
      { name: { contains: q.search, mode: 'insensitive' } },
      { party: { name: { contains: q.search, mode: 'insensitive' } } },
    ];
    if (q.from || q.to) where.date = {
      gte: q.from ? new Date(q.from) : undefined,
      lt: q.to ? new Date(new Date(q.to).getTime() + 86400000) : undefined,
    };
    return paginate(this.prisma.order, q, {
      where,
      orderBy: { date: 'desc' },
      include: { items: true, party: { select: { uid: true, name: true } } },
    });
  }

  create(dto: CreateOrderDto) {
    return this.prisma.order.create({
      data: { name: dto.name, phone: dto.phone, note: dto.note, items: { create: dto.items } },
      include: { items: true },
    });
  }

  setStatus(id: string, status: OrderStatus) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { uid: id }, include: { items: true } });
      if (status === OrderStatus.DONE) {
        for (const it of order.items) {
          if ((it.received ?? 0) < it.qty) await tx.orderItem.update({ where: { id: it.id }, data: { received: it.qty } });
        }
      }
      return tx.order.update({ where: { id: order.id }, data: { status }, include: { items: true, party: { select: { uid: true, name: true } } } });
    });
  }

  receive(id: string, dto: ReceiveOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { uid: id }, select: { id: true } });
      for (const it of dto.items) {
        await tx.orderItem.update({ where: { uid: it.id }, data: { received: Math.max(0, it.received) } });
      }
      const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
      const allReceived = items.length > 0 && items.every((i) => (i.received ?? 0) >= i.qty);
      if (allReceived) await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.DONE } });
      return tx.order.findUnique({ where: { id: order.id }, include: { items: true, party: { select: { uid: true, name: true } } } });
    });
  }

  update(id: string, dto: UpdateOrderDto) {
    const { items, ...rest } = dto;
    return this.prisma.order.update({
      where: { uid: id },
      data: {
        ...rest,
        ...(items !== undefined ? { items: { deleteMany: {}, createMany: { data: items } } } : {}),
      },
      include: { items: true },
    });
  }

  remove(id: string) {
    return this.prisma.order.delete({ where: { uid: id } });
  }

  findByParty(partyIntId: number, q: PaginationQueryDto) {
    return paginate(this.prisma.order, q, {
      where: { partyId: partyIntId },
      include: { items: true },
      orderBy: { date: 'desc' },
    });
  }

  createForCustomer(customer: { name: string; partyIntId: number }, dto: { note?: string; items: { name: string; qty: number }[] }) {
    return this.prisma.order.create({
      data: { name: customer.name, note: dto.note, partyId: customer.partyIntId, items: { create: dto.items } },
      include: { items: true },
    });
  }
}
