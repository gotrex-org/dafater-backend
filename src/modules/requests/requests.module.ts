import {
  Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/pagination';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Permissions } from '../../common/decorators/permissions.decorator';

export class RequestItemDto {
  @IsString() name: string;
  @IsNumber() qty: number;
}
export class CreateRequestDto {
  @IsDateString() date: string;
  @IsString() clientId: string;
  @IsOptional() @IsString() note?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => RequestItemDto) items: RequestItemDto[];
}

export class ReceiveItemDto {
  @IsString() id: string; // RequestItem uid
  @IsNumber() received: number;
}
export class ReceiveDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReceiveItemDto) items: ReceiveItemDto[];
}

@Injectable()
export class RequestsService {
  constructor(private prisma: PrismaService) {}
  findAll(q: PaginationQueryDto, done?: boolean, clientId?: string) {
    const where: any = {};
    if (done !== undefined) where.done = done;
    if (clientId) where.client = { uid: clientId };
    return paginate(this.prisma.request, q, {
      where,
      orderBy: { date: 'desc' },
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
  /** Marking an order complete means the whole order was received → received = qty for all items. */
  markDone(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const req = await tx.request.findUniqueOrThrow({ where: { uid: id }, include: { items: true } });
      for (const it of req.items) {
        if ((it.received ?? 0) < it.qty) await tx.requestItem.update({ where: { id: it.id }, data: { received: it.qty } });
      }
      return tx.request.update({ where: { id: req.id }, data: { done: true, doneDate: new Date() } });
    });
  }

  /** Record received quantities per item; auto-complete the request when all items are fully received. */
  receive(id: string, dto: ReceiveDto) {
    return this.prisma.$transaction(async (tx) => {
      const req = await tx.request.findUniqueOrThrow({ where: { uid: id }, select: { id: true } });
      for (const it of dto.items) {
        await tx.requestItem.update({
          where: { uid: it.id },
          data: { received: Math.max(0, it.received) },
        });
      }
      const items = await tx.requestItem.findMany({ where: { requestId: req.id } });
      const allReceived = items.length > 0 && items.every((i) => (i.received ?? 0) >= i.qty);
      if (allReceived) {
        await tx.request.update({ where: { id: req.id }, data: { done: true, doneDate: new Date() } });
      }
      return tx.request.findUnique({ where: { id: req.id }, include: { items: true, client: true } });
    });
  }
  remove(id: string) {
    return this.prisma.request.delete({ where: { uid: id } });
  }
}

@Controller('requests')
@Permissions('requests')
export class RequestsController {
  constructor(private service: RequestsService) {}
  @Get() findAll(@Query() q: PaginationQueryDto, @Query('done') done?: string, @Query('clientId') clientId?: string) {
    return this.service.findAll(q, done === 'true', clientId);
  }
  @Post() create(@Body() dto: CreateRequestDto) {
    return this.service.create(dto);
  }
  @Patch(':id/done') markDone(@Param('id') id: string) {
    return this.service.markDone(id);
  }
  @Patch(':id/receive') receive(@Param('id') id: string, @Body() dto: ReceiveDto) {
    return this.service.receive(id, dto);
  }
  @Delete(':id') @Permissions('requests.delete') remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({ providers: [RequestsService], controllers: [RequestsController] })
export class RequestsModule {}
