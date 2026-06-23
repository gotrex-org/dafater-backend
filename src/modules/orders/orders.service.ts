import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/pagination';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateOrderDto } from './dto/orders.dto';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto) {
    return paginate(this.prisma.order, q, { orderBy: { date: 'desc' }, include: { items: true } });
  }

  create(dto: CreateOrderDto) {
    return this.prisma.order.create({
      data: { name: dto.name, phone: dto.phone, note: dto.note, items: { create: dto.items } },
      include: { items: true },
    });
  }

  setStatus(id: string, status: OrderStatus) {
    return this.prisma.order.update({ where: { uid: id }, data: { status } });
  }

  remove(id: string) {
    return this.prisma.order.delete({ where: { uid: id } });
  }
}
