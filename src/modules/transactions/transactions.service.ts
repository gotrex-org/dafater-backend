import { BadRequestException, Injectable } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { EntryType, PostEntryDto, ResolveDto, UpdateTransactionDto } from './dto/transactions.dto';
import { TransactionsRepository } from './transactions.repository';

@Injectable()
export class TransactionsService {
  constructor(private repo: TransactionsRepository) {}

  list(q: PaginationQueryDto, user: any) {
    const ownOnly = !user?.admin && user?.views?.includes('entry.ownOnly');
    return this.repo.list(q, ownOnly ? user.intId : undefined);
  }

  async post(dto: PostEntryDto, createdById?: number) {
    const date = new Date(dto.date);
    const amt = dto.amount;
    if (!amt || amt <= 0) throw new BadRequestException('المبلغ غير صحيح');
    // `create()` calls below mix relation `connect` syntax (treasury/party/category), which forces
    // Prisma's "checked" input — raw FK scalars like `createdById` aren't valid there, only the
    // relation form. `createMany()` is the opposite: it only accepts flat scalars, no relations.
    const eb: any = createdById ? { createdBy: { connect: { id: createdById } } } : {};
    const ebFlat: any = createdById ? { createdById } : {};

    switch (dto.type) {
      case EntryType.COLLECT: {
        this.requirePart(dto.partyId, 'العميل');
        this.requirePart(dto.treasuryId, 'الخزينة');
        const hasRate = !!(dto.rate && dto.rate > 0);
        const cashIn = hasRate ? amt / dto.rate! : amt;
        const cNote = hasRate ? `${dto.note || ''} (${amt} ج ÷ ${dto.rate} = ${cashIn.toFixed(2)} $)`.trim() : dto.note;
        const hasFee = !!(dto.transferFee && dto.transferFee > 0);
        const collectGroupId = hasFee ? crypto.randomUUID() : undefined;
        const collection = await this.repo.create({
          ...eb, date, type: 'تحصيل',
          party: { connect: { uid: dto.partyId } },
          treasury: { connect: { uid: dto.treasuryId } },
          credit: amt, cashIn, note: cNote,
          ...(collectGroupId ? { groupId: collectGroupId } : {}),
        });
        if (hasFee) {
          await this.repo.create({ ...eb, date, type: 'رسوم نقل', party: { connect: { uid: dto.partyId } }, debit: dto.transferFee, note: 'رسوم نقل النقدية', groupId: collectGroupId });
        }
        return collection;
      }

      case EntryType.PAY_SUPPLIER: {
        this.requirePart(dto.partyId, 'المورد');
        this.requirePart(dto.treasuryId, 'الخزينة');
        const hasRate = !!(dto.rate && dto.rate > 0);
        const cashOut = hasRate ? amt / dto.rate! : amt;
        const note = hasRate
          ? `${dto.note || ''} (${amt} ج ÷ ${dto.rate} = ${cashOut.toFixed(2)} $)`.trim()
          : dto.note;
        return this.repo.create({
          ...eb, date, type: 'دفعة لمورد',
          party: { connect: { uid: dto.partyId } },
          treasury: { connect: { uid: dto.treasuryId } },
          debit: amt, cashOut, note,
        });
      }

      case EntryType.EXPENSE: {
        this.requirePart(dto.treasuryId, 'الخزينة');
        const expenseGroupId = dto.partyId ? crypto.randomUUID() : undefined;
        const expTx = await this.repo.create({
          ...eb, date, type: 'مصروف',
          category: dto.categoryId ? { connect: { uid: dto.categoryId } } : undefined,
          treasury: { connect: { uid: dto.treasuryId } },
          cashOut: amt, note: dto.note,
          ...(expenseGroupId ? { groupId: expenseGroupId } : {}),
        });
        if (dto.partyId) {
          await this.repo.create({
            ...eb, date, type: 'مصروف على عميل',
            party: { connect: { uid: dto.partyId } },
            debit: amt, note: dto.note,
            groupId: expenseGroupId,
          });
        }
        return expTx;
      }

      case EntryType.TRANSFER: {
        this.requirePart(dto.treasuryId, 'من حساب');
        this.requirePart(dto.treasuryId2, 'إلى حساب');
        const received = dto.amount2 && dto.amount2 > 0 ? dto.amount2 : amt;
        const currencyMove = received !== amt;
        return this.repo.create({
          ...eb, date,
          type: currencyMove ? 'تحويل عملة' : 'تحويل بين الخزائن',
          treasury: { connect: { uid: dto.treasuryId } },
          treasury2: { connect: { uid: dto.treasuryId2 } },
          cashOut: amt, cashIn2: received,
          note: dto.rate ? `${dto.note || ''} (سعر: ${dto.rate})`.trim() : dto.note,
        });
      }

      case EntryType.UNKNOWN_COLLECT:
        this.requirePart(dto.treasuryId, 'الخزينة');
        return this.repo.create({
          ...eb, date, type: 'تحصيل مجهول',
          treasury: { connect: { uid: dto.treasuryId } },
          cashIn: amt, pending: true, expAmt: dto.transferFee || 0, note: dto.note,
        });

      case EntryType.DEPOSIT:
        this.requirePart(dto.treasuryId, 'الخزنة');
        return this.repo.create({
          ...eb, date, type: 'إيداع', treasury: { connect: { uid: dto.treasuryId } }, cashIn: amt, note: dto.note,
        });

      case EntryType.WITHDRAW:
        this.requirePart(dto.treasuryId, 'الخزنة');
        return this.repo.create({
          ...eb, date, type: 'سحب', treasury: { connect: { uid: dto.treasuryId } }, cashOut: amt, note: dto.note,
        });

      case EntryType.PARTY_TRANSFER: {
        this.requirePart(dto.partyId, 'الطرف المُحوِّل');
        this.requirePart(dto.partyId2, 'الطرف المستلم');
        const [from, to] = await Promise.all([
          this.repo.findPartyByUid(dto.partyId!),
          this.repo.findPartyByUid(dto.partyId2!),
        ]);
        const transferGroupId = crypto.randomUUID();
        await this.repo.createMany([
          { ...ebFlat, date, type: 'تحويل بين أطراف', partyId: from.id, credit: amt, note: dto.note || `تحويل إلى ${to.name}`, groupId: transferGroupId },
          { ...ebFlat, date, type: 'تحويل بين أطراف', partyId: to.id, debit: amt, note: dto.note || `تحويل من ${from.name}`, groupId: transferGroupId },
        ]);
        return { ok: true };
      }

      case EntryType.ADJUST:
        this.requirePart(dto.partyId, 'الحساب');
        return this.repo.create({
          ...eb, date, type: 'تسوية',
          party: { connect: { uid: dto.partyId } },
          debit: dto.direction === 'debit' ? amt : 0,
          credit: dto.direction === 'credit' ? amt : 0,
          note: dto.note,
        });

      default:
        throw new BadRequestException('نوع حركة غير معروف');
    }
  }

  pendingList() { return this.repo.pendingList(); }

  async resolve(id: string, dto: ResolveDto) {
    const txn = await this.repo.findByUid(id);
    if (!txn.pending) throw new BadRequestException('هذه الحركة ليست معلّقة');
    const fee = dto.transferFee != null ? dto.transferFee : (Number(txn.expAmt) || 0);
    const resolveGroupId = fee > 0 ? crypto.randomUUID() : undefined;
    const updated = await this.repo.updatePending(id, dto.partyId, Number(txn.cashIn), resolveGroupId);
    if (fee > 0) {
      await this.repo.create({
        date: txn.date, type: 'رسوم نقل',
        party: { connect: { uid: dto.partyId } },
        debit: fee, note: 'رسوم نقل النقدية',
        groupId: resolveGroupId,
      });
    }
    return updated;
  }

  update(id: string, dto: UpdateTransactionDto) { return this.repo.update(id, dto); }
  remove(id: string) { return this.repo.remove(id); }

  private requirePart(value: string | undefined, label: string) {
    if (!value) throw new BadRequestException(`اختر ${label}`);
  }
}
