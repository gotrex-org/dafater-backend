import {
  Body, Controller, Delete, Get, Injectable, Module,
  NotFoundException, Param, Post, Query,
} from '@nestjs/common';
import {
  IsArray, IsEnum, IsNumber, IsOptional, IsString, ValidateNested, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/pagination';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Permissions } from '../../common/decorators/permissions.decorator';

class InvoiceItemDto {
  @IsString() productId: string;
  @IsNumber() qty: number;
  @IsNumber() price: number;
}

export class CreateInvoiceDto {
  @IsEnum(InvoiceKind) kind: InvoiceKind;
  @IsString() no: string;
  @IsDateString() date: string;
  @IsString() partyId: string;
  @IsString() warehouseId: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  @IsOptional() @IsNumber() paid?: number;
  @IsOptional() @IsString() treasuryId?: string;
  @IsOptional() @IsString() note?: string;

  // purchase only
  @IsOptional() @IsNumber() commissionAmount?: number;
  @IsOptional() @IsString() commissionTo?: string;
}

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto, kind?: InvoiceKind) {
    return paginate(this.prisma.invoice, q, {
      where: kind ? { kind } : {},
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { party: true, warehouse: true, items: { include: { product: true } } },
    });
  }

  async findOne(id: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      include: { party: true, warehouse: true, treasury: true, items: { include: { product: true } } },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  /**
   * Creates an invoice + its derived ledger transactions in one DB transaction.
   * Stock is NOT written separately — it is derived from invoice items by
   * BalancesService.stockOf (sale lines subtract, purchase lines add).
   */
  async create(dto: CreateInvoiceDto) {
    const total = dto.items.reduce((s, it) => s + it.qty * it.price, 0);
    const paid = dto.paid || 0;
    const isSale = dto.kind === InvoiceKind.SALE;
    const date = new Date(dto.date);

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          kind: dto.kind,
          no: dto.no,
          date,
          partyId: dto.partyId,
          warehouseId: dto.warehouseId,
          paid,
          treasuryId: dto.treasuryId || null,
          note: dto.note,
          commissionAmount: dto.commissionAmount ?? null,
          commissionTo: dto.commissionTo ?? null,
          items: {
            create: dto.items.map((it) => ({
              productId: it.productId,
              qty: it.qty,
              price: it.price,
            })),
          },
        },
      });

      const txns: Prisma.TransactionCreateManyInput[] = [];

      if (isSale) {
        // customer owes us the full amount
        txns.push({
          date, type: 'فاتورة بيع', partyId: dto.partyId,
          debit: total, note: `فاتورة بيع #${dto.no}`, invoiceId: invoice.id,
        });
        if (paid > 0) {
          txns.push({
            date, type: 'تحصيل', partyId: dto.partyId, treasuryId: dto.treasuryId || null,
            credit: paid, cashIn: paid, note: `محصّل مع فاتورة #${dto.no}`, invoiceId: invoice.id,
          });
        }
      } else {
        // we owe the supplier the full amount
        txns.push({
          date, type: 'فاتورة شراء', partyId: dto.partyId,
          credit: total, note: `فاتورة شراء #${dto.no}`, invoiceId: invoice.id,
        });
        if (paid > 0) {
          txns.push({
            date, type: 'دفعة لمورد', partyId: dto.partyId, treasuryId: dto.treasuryId || null,
            debit: paid, cashOut: paid, note: `مدفوع مع فاتورة #${dto.no}`, invoiceId: invoice.id,
          });
        }
        if (dto.commissionAmount && dto.commissionAmount > 0) {
          const cat = await tx.expenseCategory.findFirst({ where: { name: 'عمولة' } });
          txns.push({
            date, type: 'عمولة', categoryId: cat?.id || null,
            expAmt: dto.commissionAmount,
            note: `عمولة فاتورة #${dto.no}${dto.commissionTo ? ' — ' + dto.commissionTo : ''}`,
            invoiceId: invoice.id,
          });
        }
      }

      if (txns.length) await tx.transaction.createMany({ data: txns });

      return tx.invoice.findUnique({
        where: { id: invoice.id },
        include: { items: { include: { product: true } }, party: true, warehouse: true },
      });
    });
  }

  /** Deleting an invoice cascades its transactions (invoiceId relation). */
  remove(id: string) {
    return this.prisma.invoice.delete({ where: { id } });
  }
}

@Controller('invoices')
@Permissions('invoices')
export class InvoicesController {
  constructor(private service: InvoicesService) {}

  @Get()
  findAll(@Query() q: PaginationQueryDto, @Query('kind') kind?: InvoiceKind) {
    return this.service.findAll(q, kind);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateInvoiceDto) {
    return this.service.create(dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({ providers: [InvoicesService], controllers: [InvoicesController] })
export class InvoicesModule {}
