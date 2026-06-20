import {
  BadRequestException, Body, Controller, Delete, Get, Injectable,
  Module, Param, Post, Query,
} from '@nestjs/common';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/pagination';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Permissions } from '../../common/decorators/permissions.decorator';

export enum EntryType {
  COLLECT = 'collect', // تحصيل من عميل
  PAY_SUPPLIER = 'paySupplier', // دفع لمورد
  EXPENSE = 'expense', // مصروف
  TRANSFER = 'transfer', // تحويل بين الخزائن / تحويل عملة
  ADJUST = 'adjust', // تسوية حساب
}

export class PostEntryDto {
  @IsEnum(EntryType) type: EntryType;
  @IsDateString() date: string;
  @IsNumber() amount: number;

  @IsOptional() @IsString() partyId?: string;
  @IsOptional() @IsString() treasuryId?: string;
  @IsOptional() @IsString() treasuryId2?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsNumber() rate?: number; // exchange rate (EGP per USD)
  @IsOptional() @IsNumber() amount2?: number; // received amount on currency transfer
  @IsOptional() @IsString() direction?: 'debit' | 'credit'; // for adjust
  @IsOptional() @IsString() note?: string;
}

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  list(q: PaginationQueryDto, date?: string) {
    return paginate(this.prisma.transaction, q, {
      where: date ? { date: new Date(date) } : {},
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { party: true, treasury: true, treasury2: true, category: true },
    });
  }

  /** Post a daily-entry movement; returns the created transaction(s). */
  async post(dto: PostEntryDto) {
    const date = new Date(dto.date);
    const amt = dto.amount;
    if (!amt || amt <= 0) throw new BadRequestException('المبلغ غير صحيح');

    switch (dto.type) {
      case EntryType.COLLECT:
        this.requirePart(dto.partyId, 'العميل');
        this.requirePart(dto.treasuryId, 'الخزينة');
        return this.prisma.transaction.create({
          data: {
            date, type: 'تحصيل', partyId: dto.partyId, treasuryId: dto.treasuryId,
            credit: amt, cashIn: amt, note: dto.note,
          },
        });

      case EntryType.PAY_SUPPLIER: {
        this.requirePart(dto.partyId, 'المورد');
        this.requirePart(dto.treasuryId, 'الخزينة');
        // if treasury is USD, amount is in USD; ledger debit is EGP value
        const ledgerDebit = dto.rate && dto.rate > 0 ? amt * dto.rate : amt;
        const note = dto.rate ? `${dto.note || ''} (سعر $: ${dto.rate})`.trim() : dto.note;
        return this.prisma.transaction.create({
          data: {
            date, type: 'دفعة لمورد', partyId: dto.partyId, treasuryId: dto.treasuryId,
            debit: ledgerDebit, cashOut: amt, note,
          },
        });
      }

      case EntryType.EXPENSE:
        this.requirePart(dto.treasuryId, 'الخزينة');
        return this.prisma.transaction.create({
          data: {
            date, type: 'مصروف', categoryId: dto.categoryId || null, treasuryId: dto.treasuryId,
            cashOut: amt, note: dto.note,
          },
        });

      case EntryType.TRANSFER: {
        this.requirePart(dto.treasuryId, 'من حساب');
        this.requirePart(dto.treasuryId2, 'إلى حساب');
        const received = dto.amount2 && dto.amount2 > 0 ? dto.amount2 : amt;
        const currencyMove = received !== amt;
        return this.prisma.transaction.create({
          data: {
            date,
            type: currencyMove ? 'تحويل عملة' : 'تحويل بين الخزائن',
            treasuryId: dto.treasuryId, treasuryId2: dto.treasuryId2,
            cashOut: amt, cashIn2: received,
            note: dto.rate ? `${dto.note || ''} (سعر: ${dto.rate})`.trim() : dto.note,
          },
        });
      }

      case EntryType.ADJUST:
        this.requirePart(dto.partyId, 'الحساب');
        return this.prisma.transaction.create({
          data: {
            date, type: 'تسوية', partyId: dto.partyId,
            debit: dto.direction === 'debit' ? amt : 0,
            credit: dto.direction === 'credit' ? amt : 0,
            note: dto.note,
          },
        });

      default:
        throw new BadRequestException('نوع حركة غير معروف');
    }
  }

  remove(id: string) {
    return this.prisma.transaction.delete({ where: { id } });
  }

  private requirePart(value: string | undefined, label: string) {
    if (!value) throw new BadRequestException(`اختر ${label}`);
  }
}

@Controller('transactions')
@Permissions('entry', 'treasury', 'ledger')
export class TransactionsController {
  constructor(private service: TransactionsService) {}

  @Get()
  list(@Query() q: PaginationQueryDto, @Query('date') date?: string) {
    return this.service.list(q, date);
  }

  @Post()
  @Permissions('entry')
  post(@Body() dto: PostEntryDto) {
    return this.service.post(dto);
  }

  @Delete(':id')
  @Permissions('entry')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({ providers: [TransactionsService], controllers: [TransactionsController] })
export class TransactionsModule {}
