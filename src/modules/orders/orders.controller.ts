import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrderStatus } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateOrderDto, UpdateOrderDto, ReceiveOrderDto } from './dto/orders.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private service: OrdersService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.service.create(dto);
  }

  @Get('my')
  myOrders(@Req() req: any, @Query() q: PaginationQueryDto) {
    if (!req.user?.partyIntId) throw new ForbiddenException('الحساب غير مرتبط بعميل');
    return this.service.findByParty(req.user.partyIntId, q);
  }

  @Post('my')
  myOrder(@Req() req: any, @Body() dto: { note?: string; items: { name: string; qty: number }[] }) {
    if (!req.user?.partyIntId) throw new ForbiddenException('الحساب غير مرتبط بعميل');
    return this.service.createForCustomer({ name: req.user.name, partyIntId: req.user.partyIntId }, dto);
  }

  @Get()
  @Permissions('orders')
  findAll(@Query() q: PaginationQueryDto, @Query('done') done?: string) {
    const doneFilter = done === 'true' ? true : done === 'false' ? false : undefined;
    return this.service.findAll(q, doneFilter);
  }

  @Patch(':id/done')
  @Permissions('orders')
  markDone(@Param('id') id: string) {
    return this.service.setStatus(id, OrderStatus.DONE);
  }

  @Patch(':id/receive')
  @Permissions('orders')
  receive(@Param('id') id: string, @Body() dto: ReceiveOrderDto) {
    return this.service.receive(id, dto);
  }

  @Patch(':id')
  @Permissions('orders')
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions('orders')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
