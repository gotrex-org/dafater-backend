import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrderStatus } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateOrderDto } from './dto/orders.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private service: OrdersService) {}

  // public order submission (no login) — mirrors the old order form
  // abuse protection: max 10 submissions per minute per IP
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions('orders')
  findAll(@Query() q: PaginationQueryDto) {
    return this.service.findAll(q);
  }

  @Patch(':id/done')
  @Permissions('orders')
  markDone(@Param('id') id: string) {
    return this.service.setStatus(id, OrderStatus.DONE);
  }

  @Delete(':id')
  @Permissions('orders')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
