import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateOrderDto, UpdateOrderDto, ReceiveOrderDto } from './dto/orders.dto';
import { OrdersRepository } from './orders.repository';

@Injectable()
export class OrdersService {
  constructor(private repo: OrdersRepository) {}

  findAll(q: PaginationQueryDto, done?: boolean) { return this.repo.findAll(q, done); }
  create(dto: CreateOrderDto) { return this.repo.create(dto); }
  setStatus(id: string, status: OrderStatus) { return this.repo.setStatus(id, status); }
  receive(id: string, dto: ReceiveOrderDto) { return this.repo.receive(id, dto); }
  update(id: string, dto: UpdateOrderDto) { return this.repo.update(id, dto); }
  remove(id: string) { return this.repo.remove(id); }
  findByParty(partyIntId: number, q: PaginationQueryDto) { return this.repo.findByParty(partyIntId, q); }
  createForCustomer(customer: { name: string; partyIntId: number }, dto: { note?: string; items: { name: string; qty: number }[] }) {
    return this.repo.createForCustomer(customer, dto);
  }
}
