import {
  BadRequestException, Body, Controller, Delete, Get, Injectable,
  Module, Param, Patch, Post, Query,
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
  UNKNOWN_COLLECT = 'unknownCollect', // تحصيل مجهول (صاحبه غير معروف بعد)
  DEPOSIT = 'deposit', // إيداع رصيد في خزنة
  WITHDRAW = 'withdraw', // سحب رصيد من خزنة
  PARTY_TRANSFER = 'partyTransfer', // تحويل رصيد من طرف لطرف تاني
}

export class ResolveDto {
  @IsString() partyId: string;
  @IsOptional() @IsNumber() transferFee?: number; // رسوم نقل تُضاف وقت الترحيل لو ماتعملتش وقت التحصيل
}

export class PostEntryDto {
  @IsEnum(EntryType) type: EntryType;
  @IsDateString() date: string;
  @IsNumber() amount: number;

  @IsOptional() @IsString() partyId?: string;
  @IsOptional() @IsString() partyId2?: string; // الطرف المستلم في التحويل بين الأطراف
  @IsOptional() @IsString() treasuryId?: string;
  @IsOptional() @IsString() treasuryId2?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsNumber() rate?: number; // exchange rate (EGP per USD)
  @IsOptional() @IsNumber() amount2?: number; // received amount on currency transfer
  @IsOptional() @IsString() direction?: 'debit' | 'credit'; // for adjust
  @IsOptional() @IsNumber() transferFee?: number; // رسوم نقل النقدية — تُسجّل على العميل (مدين)
  @IsOptional() @IsString() note?: string;
}

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  list(q: PaginationQueryDto, date?: string) {
    return paginate(this.prisma.transaction, q, {
      where: date ? { date: new Date(date) } : {},
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { party: true, treasury: true, treasury2: true, category: true, invoice: { select: { uid: true } }, deal: { select: { uid: true } } },
    });
  }

  /** Post a daily-entry movement; returns the created transaction(s). */
  async post(dto: PostEntryDto) {
    const date = new Date(dto.date);
    const amt = dto.amount;
    if (!amt || amt <= 0) throw new BadRequestException('المبلغ غير صحيح');

    switch (dto.type) {
      case EntryType.COLLECT: {
        this.requirePart(dto.partyId, 'العميل');
        this.requirePart(dto.treasuryId, 'الخزينة');
        // amt = المبلغ المصري؛ لو فيه سعر دولار يدخل الخزنة بالدولار (المصري ÷ السعر)
        const hasRate = !!(dto.rate && dto.rate > 0);
        const cashIn = hasRate ? amt / dto.rate! : amt;
        const cNote = hasRate ? `${dto.note || ''} (${amt} ج ÷ ${dto.rate} = ${cashIn.toFixed(2)} $)`.trim() : dto.note;
        const collection = await this.prisma.transaction.create({
          data: {
            date, type: 'تحصيل',
            party: { connect: { uid: dto.partyId } },
            treasury: { connect: { uid: dto.treasuryId } },
            credit: amt, cashIn, note: cNote,
          },
        });
        // optional cash-transfer fee charged to the client (debit)
        if (dto.transferFee && dto.transferFee > 0) {
          await this.prisma.transaction.create({
            data: { date, type: 'رسوم نقل', party: { connect: { uid: dto.partyId } }, debit: dto.transferFee, note: 'رسوم نقل النقدية' },
          });
        }
        return collection;
      }

      case EntryType.PAY_SUPPLIER: {
        this.requirePart(dto.partyId, 'المورد');
        this.requirePart(dto.treasuryId, 'الخزينة');
        // amt = المبلغ المصري؛ لو الخزنة بالدولار يتحوّل لدولار حسب السعر (المصري ÷ السعر)
        const hasRate = !!(dto.rate && dto.rate > 0);
        const cashOut = hasRate ? amt / dto.rate! : amt;
        const note = hasRate
          ? `${dto.note || ''} (${amt} ج ÷ ${dto.rate} = ${cashOut.toFixed(2)} $)`.trim()
          : dto.note;
        return this.prisma.transaction.create({
          data: {
            date, type: 'دفعة لمورد',
            party: { connect: { uid: dto.partyId } },
            treasury: { connect: { uid: dto.treasuryId } },
            debit: amt, cashOut, note, // المورد يتحاسب بالمصري، والخزنة تنقص بالدولار
          },
        });
      }

      case EntryType.EXPENSE:
        this.requirePart(dto.treasuryId, 'الخزينة');
        return this.prisma.transaction.create({
          data: {
            date, type: 'مصروف',
            category: dto.categoryId ? { connect: { uid: dto.categoryId } } : undefined,
            treasury: { connect: { uid: dto.treasuryId } },
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
            treasury: { connect: { uid: dto.treasuryId } },
            treasury2: { connect: { uid: dto.treasuryId2 } },
            cashOut: amt, cashIn2: received,
            note: dto.rate ? `${dto.note || ''} (سعر: ${dto.rate})`.trim() : dto.note,
          },
        });
      }

      case EntryType.UNKNOWN_COLLECT:
        // money received into the treasury, owner not yet known → pending, no party.
        // an optional transfer fee is parked in expAmt and charged to the client on resolve.
        this.requirePart(dto.treasuryId, 'الخزينة');
        return this.prisma.transaction.create({
          data: {
            date, type: 'تحصيل مجهول',
            treasury: { connect: { uid: dto.treasuryId } },
            cashIn: amt, pending: true, expAmt: dto.transferFee || 0, note: dto.note,
          },
        });

      case EntryType.DEPOSIT:
        this.requirePart(dto.treasuryId, 'الخزنة');
        return this.prisma.transaction.create({
          data: { date, type: 'إيداع', treasury: { connect: { uid: dto.treasuryId } }, cashIn: amt, note: dto.note },
        });

      case EntryType.WITHDRAW:
        this.requirePart(dto.treasuryId, 'الخزنة');
        return this.prisma.transaction.create({
          data: { date, type: 'سحب', treasury: { connect: { uid: dto.treasuryId } }, cashOut: amt, note: dto.note },
        });

      case EntryType.PARTY_TRANSFER: {
        this.requirePart(dto.partyId, 'الطرف المُحوِّل');
        this.requirePart(dto.partyId2, 'الطرف المستلم');
        const [from, to] = await Promise.all([
          this.prisma.party.findUniqueOrThrow({ where: { uid: dto.partyId }, select: { id: true, name: true } }),
          this.prisma.party.findUniqueOrThrow({ where: { uid: dto.partyId2 }, select: { id: true, name: true } }),
        ]);
        // ينقّص رصيد المُحوِّل (دائن) ويزوّد رصيد المستلم (مدين) بنفس المبلغ
        await this.prisma.transaction.createMany({
          data: [
            { date, type: 'تحويل بين أطراف', partyId: from.id, credit: amt, note: dto.note || `تحويل إلى ${to.name}` },
            { date, type: 'تحويل بين أطراف', partyId: to.id, debit: amt, note: dto.note || `تحويل من ${from.name}` },
          ],
        });
        return { ok: true };
      }

      case EntryType.ADJUST:
        this.requirePart(dto.partyId, 'الحساب');
        return this.prisma.transaction.create({
          data: {
            date, type: 'تسوية',
            party: { connect: { uid: dto.partyId } },
            debit: dto.direction === 'debit' ? amt : 0,
            credit: dto.direction === 'credit' ? amt : 0,
            note: dto.note,
          },
        });

      default:
        throw new BadRequestException('نوع حركة غير معروف');
    }
  }

  /** Pending unknown collections (owner not yet identified). */
  pendingList() {
    return this.prisma.transaction.findMany({
      where: { pending: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { treasury: true },
    });
  }

  /** Identify the owner of a pending collection → credit their ledger and clear pending. */
  async resolve(id: string, dto: ResolveDto) {
    const txn = await this.prisma.transaction.findUniqueOrThrow({ where: { uid: id } });
    if (!txn.pending) throw new BadRequestException('هذه الحركة ليست معلّقة');
    // fee: prefer the one entered now (on pending), else the one parked at collection time
    const fee = dto.transferFee != null ? dto.transferFee : (txn.expAmt || 0);
    const updated = await this.prisma.transaction.update({
      where: { uid: id },
      data: {
        party: { connect: { uid: dto.partyId } },
        credit: txn.cashIn, // attribute the received cash to the client's ledger
        type: 'تحصيل',
        pending: false,
        expAmt: 0,
      },
    });
    if (fee > 0) {
      await this.prisma.transaction.create({
        data: { date: txn.date, type: 'رسوم نقل', party: { connect: { uid: dto.partyId } }, debit: fee, note: 'رسوم نقل النقدية' },
      });
    }
    return updated;
  }

  remove(id: string) {
    return this.prisma.transaction.delete({ where: { uid: id } });
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

  @Get('pending')
  pending() {
    return this.service.pendingList();
  }

  @Post()
  @Permissions('entry')
  post(@Body() dto: PostEntryDto) {
    return this.service.post(dto);
  }

  @Patch(':id/resolve')
  @Permissions('entry')
  resolve(@Param('id') id: string, @Body() dto: ResolveDto) {
    return this.service.resolve(id, dto);
  }

  @Delete(':id')
  @Permissions('entry')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({ providers: [TransactionsService], controllers: [TransactionsController] })
export class TransactionsModule {}
