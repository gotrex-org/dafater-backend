import {
  Body, Controller, Delete, Get, Injectable, Module, Param, Post, Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray, IsDateString, IsNumber, IsOptional, IsString, ValidateNested,
} from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/pagination';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Permissions } from '../../common/decorators/permissions.decorator';

export class DealItemDto {
  @IsString() productId: string;
  @IsNumber() qty: number;
  @IsNumber() price: number;
}
export class CreateDealDto {
  @IsString() no: string;
  @IsDateString() date: string;
  @IsString() clientId: string;
  @IsString() supplierId: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => DealItemDto) items: DealItemDto[];
  @IsOptional() @IsNumber() paidIn?: number;
  @IsOptional() @IsNumber() paidOut?: number;
  @IsOptional() @IsString() treasuryId?: string;
  @IsOptional() @IsString() note?: string;
}

@Injectable()
export class DealsService {
  constructor(private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto) {
    return paginate(this.prisma.deal, q, {
      orderBy: [{ date: 'desc' }],
      include: { client: true, supplier: true, items: { include: { product: true } } },
    });
  }

  /**
   * External pass-through: client is billed, supplier is credited, no stock move.
   */
  async create(dto: CreateDealDto) {
    const total = dto.items.reduce((s, it) => s + it.qty * it.price, 0);
    const date = new Date(dto.date);
    const paidIn = dto.paidIn || 0;
    const paidOut = dto.paidOut || 0;

    return this.prisma.$transaction(async (tx) => {
      const deal = await tx.deal.create({
        data: {
          no: dto.no, date, clientId: dto.clientId, supplierId: dto.supplierId,
          paidIn, paidOut, treasuryId: dto.treasuryId || null, note: dto.note,
          items: { create: dto.items.map((it) => ({ productId: it.productId, qty: it.qty, price: it.price })) },
        },
      });

      const txns: Prisma.TransactionCreateManyInput[] = [
        { date, type: 'بيع خارجي', partyId: dto.clientId, debit: total, note: `بيع خارجي #${dto.no}`, dealId: deal.id },
        { date, type: 'شراء خارجي', partyId: dto.supplierId, credit: total, note: `شراء خارجي #${dto.no}`, dealId: deal.id },
      ];
      if (paidIn > 0)
        txns.push({ date, type: 'تحصيل', partyId: dto.clientId, treasuryId: dto.treasuryId || null, credit: paidIn, cashIn: paidIn, dealId: deal.id });
      if (paidOut > 0)
        txns.push({ date, type: 'دفعة لمورد', partyId: dto.supplierId, treasuryId: dto.treasuryId || null, debit: paidOut, cashOut: paidOut, dealId: deal.id });

      await tx.transaction.createMany({ data: txns });
      return tx.deal.findUnique({ where: { id: deal.id }, include: { client: true, supplier: true, items: true } });
    });
  }

  remove(id: string) {
    return this.prisma.deal.delete({ where: { id } });
  }
}

@Controller('deals')
@Permissions('deals')
export class DealsController {
  constructor(private service: DealsService) {}
  @Get() findAll(@Query() q: PaginationQueryDto) {
    return this.service.findAll(q);
  }
  @Post() create(@Body() dto: CreateDealDto) {
    return this.service.create(dto);
  }
  @Delete(':id') remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({ providers: [DealsService], controllers: [DealsController] })
export class DealsModule {}
