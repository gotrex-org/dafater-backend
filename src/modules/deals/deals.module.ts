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
  @IsNumber() price: number; // sell price (to client)
  @IsOptional() @IsNumber() buyPrice?: number; // buy price (from supplier)
}
export class CreateDealDto {
  @IsOptional() @IsString() no?: string; // auto-numbered when omitted
  @IsDateString() date: string;
  @IsString() clientId: string;
  @IsString() supplierId: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => DealItemDto) items: DealItemDto[];
  @IsOptional() @IsNumber() paidIn?: number;
  @IsOptional() @IsNumber() paidOut?: number;
  @IsOptional() @IsString() treasuryId?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsNumber() commissionAmount?: number;
  @IsOptional() @IsString() commissionPartyId?: string;
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
    const sellTotal = dto.items.reduce((s, it) => s + it.qty * it.price, 0);
    const buyTotal = dto.items.reduce((s, it) => s + it.qty * (it.buyPrice || 0), 0);
    const date = new Date(dto.date);
    const paidIn = dto.paidIn || 0;
    const paidOut = dto.paidOut || 0;

    return this.prisma.$transaction(async (tx) => {
      // resolve public uids -> internal integer ids
      const [client, supplier, treasury] = await Promise.all([
        tx.party.findUniqueOrThrow({ where: { uid: dto.clientId }, select: { id: true } }),
        tx.party.findUniqueOrThrow({ where: { uid: dto.supplierId }, select: { id: true } }),
        dto.treasuryId
          ? tx.treasuryAccount.findUniqueOrThrow({ where: { uid: dto.treasuryId }, select: { id: true } })
          : Promise.resolve(null),
      ]);
      const commissionParty = dto.commissionPartyId
        ? await tx.party.findUniqueOrThrow({ where: { uid: dto.commissionPartyId }, select: { id: true } })
        : null;
      const products = await tx.product.findMany({
        where: { uid: { in: dto.items.map((it) => it.productId) } },
        select: { id: true, uid: true },
      });
      const productIdByUid = new Map(products.map((p) => [p.uid, p.id]));

      const no = dto.no?.trim() || (await this.nextNo(tx));

      const deal = await tx.deal.create({
        data: {
          no, date, clientId: client.id, supplierId: supplier.id,
          paidIn, paidOut, treasuryId: treasury?.id ?? null, note: dto.note,
          items: { create: dto.items.map((it) => ({ productId: productIdByUid.get(it.productId)!, qty: it.qty, price: it.price, buyPrice: it.buyPrice || 0 })) },
        },
      });

      const txns: Prisma.TransactionCreateManyInput[] = [
        // client owes us the SELL total; we owe the supplier the BUY total
        { date, type: 'بيع خارجي', partyId: client.id, debit: sellTotal, note: `بيع خارجي #${no}`, dealId: deal.id },
        { date, type: 'شراء خارجي', partyId: supplier.id, credit: buyTotal, note: `شراء خارجي #${no}`, dealId: deal.id },
      ];
      if (paidIn > 0)
        txns.push({ date, type: 'تحصيل', partyId: client.id, treasuryId: treasury?.id ?? null, credit: paidIn, cashIn: paidIn, dealId: deal.id });
      if (paidOut > 0)
        txns.push({ date, type: 'دفعة لمورد', partyId: supplier.id, treasuryId: treasury?.id ?? null, debit: paidOut, cashOut: paidOut, dealId: deal.id });
      if (dto.commissionAmount && dto.commissionAmount > 0 && commissionParty)
        txns.push({ date, type: 'commission', partyId: commissionParty.id, credit: dto.commissionAmount, note: `commission صفقة #${no}`, dealId: deal.id });

      await tx.transaction.createMany({ data: txns });
      return tx.deal.findUnique({ where: { id: deal.id }, include: { client: true, supplier: true, items: true } });
    });
  }

  /** Next sequential deal number: max existing numeric `no` + 1. */
  private async nextNo(tx: Prisma.TransactionClient): Promise<string> {
    const rows = await tx.deal.findMany({ select: { no: true } });
    const max = rows.reduce((mx, r) => {
      const n = parseInt(r.no, 10);
      return Number.isFinite(n) && n > mx ? n : mx;
    }, 0);
    return String(max + 1);
  }

  remove(id: string) {
    return this.prisma.deal.delete({ where: { uid: id } });
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
  @Delete(':id') @Permissions('deals.delete') remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({ providers: [DealsService], controllers: [DealsController] })
export class DealsModule {}
