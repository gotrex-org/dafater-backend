import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/pagination';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';

export class OrderItemDto {
  @IsString() name: string;
  @IsNumber() qty: number;
}
export class CreateOrderDto {
  @IsString() name: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() note?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => OrderItemDto) items: OrderItemDto[];
}

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

  @Get() @Permissions('orders') findAll(@Query() q: PaginationQueryDto) {
    return this.service.findAll(q);
  }
  @Patch(':id/done') @Permissions('orders') markDone(@Param('id') id: string) {
    return this.service.setStatus(id, OrderStatus.DONE);
  }
  @Delete(':id') @Permissions('orders') remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({ providers: [OrdersService], controllers: [OrdersController] })
export class OrdersModule {}
