import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { EntryType, PostEntryDto, ResolveDto, UpdateTransactionDto } from './dto/transactions.dto';
import { TransactionsRepository } from './transactions.repository';

@Injectable()
export class TransactionsService {
  constructor(
    private repo: TransactionsRepository,
    private prisma: PrismaService,
  ) {}

  list(q: PaginationQueryDto, user: any) {
    const ownOnly = !user?.admin && user?.views?.includes('entry.ownOnly');
    return this.repo.list(q, ownOnly ? user.intId : undefined);
  }

  async post(dto: PostEntryDto, user?: any) {
    const createdById = user?.intId;
    const date = new Date(dto.date);
    const amt = dto.amount;
    if (!amt || amt <= 0) throw new BadRequestException('المبلغ غير صحيح');
    this.requireTreasuryAllowed(dto.treasuryId, user);
    // الوجهة في التحويل (treasuryId2) مش لازم تكون ضمن خزائن المستخدم — يقدر يحوّل لأي خزينة.
    // `create()` calls below mix relation `connect` syntax (treasury/party/category), which forces
    // Prisma's "checked" input — raw FK scalars like `createdById` aren't valid there, only the
    // relation form. `createMany()` is the opposite: it only accepts flat scalars, no relations.
    const eb: any = createdById ? { createdBy: { connect: { id: createdById } } } : {};

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
        const feeNote = hasFee ? ` (شامل رسوم نقل ${dto.transferFee} ج)` : '';
        this.logTxn(user, 'CREATE', collection.uid,
          `تحصيل ${amt} ج من ${collection.party?.name ?? ''} إلى خزينة ${collection.treasury?.name ?? ''}${feeNote}`);
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
        const payment = await this.repo.create({
          ...eb, date, type: 'دفعة لمورد',
          party: { connect: { uid: dto.partyId } },
          treasury: { connect: { uid: dto.treasuryId } },
          debit: amt, cashOut, note,
        });
        this.logTxn(user, 'CREATE', payment.uid,
          `دفع ${amt} ج لـ ${payment.party?.name ?? ''} من خزينة ${payment.treasury?.name ?? ''}`);
        return payment;
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
        let onParty = '';
        if (dto.partyId) {
          const partyTx = await this.repo.create({
            ...eb, date, type: 'مصروف على عميل',
            party: { connect: { uid: dto.partyId } },
            debit: amt, note: dto.note,
            groupId: expenseGroupId,
          });
          onParty = ` — على حساب ${partyTx.party?.name ?? ''}`;
        }
        const catNote = expTx.category?.name ? ` (${expTx.category.name})` : '';
        this.logTxn(user, 'CREATE', expTx.uid,
          `مصروف ${amt} ج من خزينة ${expTx.treasury?.name ?? ''}${catNote}${onParty}`);
        return expTx;
      }

      case EntryType.CASH: {
        // صرف وتوريد نقدية موحّد: اتجاه (صرف/توريد) + جهة (عميل/مورد/مخزن/بضاعة/تسوية/حساب)
        const dir = dto.cashDir === 'in' ? 'in' : 'out';
        const target = dto.cashTarget || 'settlement';
        const isOut = dir === 'out';
        // تسوية الحساب بتعدّل رصيد الطرف بس من غير خزينة — باقي الجهات لازمها خزينة.
        if (target !== 'account') this.requirePart(dto.treasuryId, 'الخزينة');
        const dirWord = isOut ? 'صرف' : 'توريد';
        // أثر الخزينة: صرف = خروج نقدية، توريد = دخول نقدية
        const treasuryLeg = isOut ? { cashOut: amt } : { cashIn: amt };
        // أثر الطرف (لو عميل/مورد): صرف = عليه (debit)، توريد = له (credit)
        const partyLeg = isOut ? { debit: amt } : { credit: amt };

        if (target === 'account') {
          // تسوية حساب — تعديل رصيد الطرف فقط (له/عليه) بدون تحريك الخزينة.
          this.requirePart(dto.partyId, 'الحساب');
          const tx = await this.repo.create({
            ...eb, date, type: 'تسوية',
            party: { connect: { uid: dto.partyId } },
            ...partyLeg, note: dto.note,
          });
          const dirTxt = isOut ? 'عليه' : 'له';
          this.logTxn(user, 'CREATE', tx.uid, `تسوية ${dirTxt} ${amt} ج على حساب ${tx.party?.name ?? ''}`);
          return tx;
        }

        if (target === 'custody') {
          // عهدة — فلوس مع شخص (موظف أو أي حد). صرف = يديله عهدة (عليه) + خروج من الخزينة،
          // توريد = رد العهدة (له) + دخول للخزينة. الشخص طرف بدور PERSON (يتعمل تلقائي بالاسم).
          const person = await this.resolvePerson(dto);
          const tx = await this.repo.create({
            ...eb, date, type: isOut ? 'عهدة' : 'رد عهدة',
            party: { connect: { uid: person.uid } },
            treasury: { connect: { uid: dto.treasuryId } },
            ...treasuryLeg, ...partyLeg, note: dto.note,
          });
          this.logTxn(user, 'CREATE', tx.uid,
            `${isOut ? 'صرف عهدة' : 'رد عهدة'} ${amt} ج ${isOut ? 'إلى' : 'من'} ${person.name} ${isOut ? 'من' : 'إلى'} خزينة ${tx.treasury?.name ?? ''}`);
          return tx;
        }

        if (target === 'client' || target === 'supplier') {
          this.requirePart(dto.partyId, target === 'client' ? 'العميل' : 'المورد');
          const type = `${dirWord} نقدية ${target === 'client' ? 'لعميل' : 'لمورد'}`;
          const tx = await this.repo.create({
            ...eb, date, type,
            party: { connect: { uid: dto.partyId } },
            treasury: { connect: { uid: dto.treasuryId } },
            ...treasuryLeg, ...partyLeg, note: dto.note,
          });
          this.logTxn(user, 'CREATE', tx.uid,
            `${dirWord} ${amt} ج ${isOut ? 'إلى' : 'من'} ${tx.party?.name ?? ''} ${isOut ? 'من' : 'إلى'} خزينة ${tx.treasury?.name ?? ''}`);
          return tx;
        }

        if (target === 'external') {
          // مصروف خارجي — زي مصروف المخزن بس ببنود المجموعة الخارجية (من غير مخزن).
          this.requirePart(dto.treasuryId, 'الخزينة');
          const tx = await this.repo.create({
            ...eb, date, type: 'مصروف',
            category: dto.categoryId ? { connect: { uid: dto.categoryId } } : undefined,
            treasury: { connect: { uid: dto.treasuryId } },
            ...treasuryLeg, note: dto.note,
          });
          const catNote = tx.category?.name ? ` (${tx.category.name})` : '';
          this.logTxn(user, 'CREATE', tx.uid,
            `${dirWord} مصروف خارجي ${amt} ج${catNote} من خزينة ${tx.treasury?.name ?? ''}`);
          return tx;
        }

        if (target === 'warehouse') {
          this.requirePart(dto.warehouseId, 'المخزن');
          const tx = await this.repo.create({
            ...eb, date, type: 'مصروف مخزن',
            warehouse: { connect: { uid: dto.warehouseId } },
            category: dto.categoryId ? { connect: { uid: dto.categoryId } } : undefined,
            treasury: { connect: { uid: dto.treasuryId } },
            ...treasuryLeg, note: dto.note,
          });
          const catNote = tx.category?.name ? ` (${tx.category.name})` : '';
          this.logTxn(user, 'CREATE', tx.uid,
            `${dirWord} مصروف مخزن ${amt} ج — ${tx.warehouse?.name ?? ''}${catNote} من خزينة ${tx.treasury?.name ?? ''}`);
          return tx;
        }

        if (target === 'goods') {
          const tx = await this.repo.create({
            ...eb, date, type: 'مصروف بضاعة',
            warehouse: dto.warehouseId ? { connect: { uid: dto.warehouseId } } : undefined,
            treasury: { connect: { uid: dto.treasuryId } },
            ...treasuryLeg, note: dto.note,
          });
          // صرف يرفع صافي التكلفة (+)، توريد/استرداد يقلّلها (−).
          const spread = await this.distributeGoodsCost(dto, amt, isOut ? 1 : -1).catch(() => '');
          this.logTxn(user, 'CREATE', tx.uid,
            `${dirWord} مصروف بضاعة ${amt} ج${spread ? ` (${spread})` : ''} من خزينة ${tx.treasury?.name ?? ''}`);
          return tx;
        }

        // تسوية نقدية: تتخصم من إجمالي التقارير والربح
        const tx = await this.repo.create({
          ...eb, date, type: 'تسوية نقدية',
          treasury: { connect: { uid: dto.treasuryId } },
          ...treasuryLeg, note: dto.note,
        });
        this.logTxn(user, 'CREATE', tx.uid,
          `تسوية نقدية (${dirWord}) ${amt} ج من خزينة ${tx.treasury?.name ?? ''}`);
        return tx;
      }

      case EntryType.TRANSFER: {
        this.requirePart(dto.treasuryId, 'من حساب');
        this.requirePart(dto.treasuryId2, 'إلى حساب');
        const received = dto.amount2 && dto.amount2 > 0 ? dto.amount2 : amt;
        const currencyMove = received !== amt;
        const type = currencyMove ? 'تحويل عملة' : 'تحويل بين الخزائن';
        const transfer = await this.repo.create({
          ...eb, date, type,
          treasury: { connect: { uid: dto.treasuryId } },
          treasury2: { connect: { uid: dto.treasuryId2 } },
          cashOut: amt, cashIn2: received,
          note: dto.rate ? `${dto.note || ''} (سعر: ${dto.rate})`.trim() : dto.note,
        });
        const recvNote = currencyMove ? ` (${received} مستلمة)` : '';
        this.logTxn(user, 'CREATE', transfer.uid,
          `${type}: ${amt} ج من خزينة ${transfer.treasury?.name ?? ''} إلى خزينة ${transfer.treasury2?.name ?? ''}${recvNote}`);
        return transfer;
      }

      case EntryType.UNKNOWN_COLLECT: {
        this.requirePart(dto.treasuryId, 'الخزينة');
        const tx = await this.repo.create({
          ...eb, date, type: 'تحصيل مجهول',
          treasury: { connect: { uid: dto.treasuryId } },
          cashIn: amt, pending: true, expAmt: dto.transferFee || 0, note: dto.note,
        });
        this.logTxn(user, 'CREATE', tx.uid, `تحصيل مجهول ${amt} ج في خزينة ${tx.treasury?.name ?? ''}`);
        return tx;
      }

      case EntryType.DEPOSIT: {
        this.requirePart(dto.treasuryId, 'الخزنة');
        const tx = await this.repo.create({
          ...eb, date, type: 'إيداع', treasury: { connect: { uid: dto.treasuryId } }, cashIn: amt, note: dto.note,
        });
        this.logTxn(user, 'CREATE', tx.uid, `إيداع ${amt} ج في خزينة ${tx.treasury?.name ?? ''}`);
        return tx;
      }

      case EntryType.WITHDRAW: {
        this.requirePart(dto.treasuryId, 'الخزنة');
        const tx = await this.repo.create({
          ...eb, date, type: 'سحب', treasury: { connect: { uid: dto.treasuryId } }, cashOut: amt, note: dto.note,
        });
        this.logTxn(user, 'CREATE', tx.uid, `سحب ${amt} ج من خزينة ${tx.treasury?.name ?? ''}`);
        return tx;
      }

      case EntryType.PARTY_TRANSFER: {
        this.requirePart(dto.partyId, 'الطرف المُحوِّل');
        this.requirePart(dto.partyId2, 'الطرف المستلم');
        const [from, to] = await Promise.all([
          this.repo.findPartyByUid(dto.partyId!),
          this.repo.findPartyByUid(dto.partyId2!),
        ]);
        const transferGroupId = crypto.randomUUID();
        // المُحوِّل (from) يتخصم منه المبلغ (debit) والمستلم (to) يتضاف له (credit).
        const leg1 = await this.repo.create({
          ...eb, date, type: 'تحويل بين أطراف', party: { connect: { uid: dto.partyId } },
          debit: amt, note: dto.note || `تحويل إلى ${to.name}`, groupId: transferGroupId,
        });
        await this.repo.create({
          ...eb, date, type: 'تحويل بين أطراف', party: { connect: { uid: dto.partyId2 } },
          credit: amt, note: dto.note || `تحويل من ${from.name}`, groupId: transferGroupId,
        });
        this.logTxn(user, 'CREATE', leg1.uid, `تحويل ${amt} ج من ${from.name} إلى ${to.name}`);
        return { ok: true };
      }

      case EntryType.ADJUST: {
        this.requirePart(dto.partyId, 'الحساب');
        const tx = await this.repo.create({
          ...eb, date, type: 'تسوية',
          party: { connect: { uid: dto.partyId } },
          debit: dto.direction === 'debit' ? amt : 0,
          credit: dto.direction === 'credit' ? amt : 0,
          note: dto.note,
        });
        const dir = dto.direction === 'debit' ? 'عليه' : 'له';
        this.logTxn(user, 'CREATE', tx.uid, `تسوية ${dir} ${amt} ج على حساب ${tx.party?.name ?? ''}`);
        return tx;
      }

      default:
        throw new BadRequestException('نوع حركة غير معروف');
    }
  }

  pendingList() { return this.repo.pendingList(); }

  async resolve(id: string, dto: ResolveDto, user?: any) {
    const txn = await this.repo.findByUid(id);
    if (!txn.pending) throw new BadRequestException('هذه الحركة ليست معلّقة');
    const fee = dto.transferFee != null ? dto.transferFee : (Number(txn.expAmt) || 0);
    const resolveGroupId = fee > 0 ? crypto.randomUUID() : undefined;
    const updated = await this.repo.updatePending(id, dto.partyId, Number(txn.cashIn), resolveGroupId);
    let feeNote = '';
    if (fee > 0) {
      await this.repo.create({
        date: txn.date, type: 'رسوم نقل',
        party: { connect: { uid: dto.partyId } },
        debit: fee, note: 'رسوم نقل النقدية',
        groupId: resolveGroupId,
      });
      feeNote = ` (رسوم نقل ${fee} ج)`;
    }
    this.logTxn(user, 'UPDATE', updated.uid,
      `ترحيل تحصيل مجهول ${Number(txn.cashIn)} ج إلى العميل ${updated.party?.name ?? ''}${feeNote}`);
    return updated;
  }

  async update(id: string, dto: UpdateTransactionDto, user?: any) {
    const before = await this.repo.findByUid(id);
    const after = await this.repo.update(id, dto);
    const diff = this.diffTxn(before, after);
    this.logTxn(user, 'UPDATE', after.uid, `تعديل حركة: ${after.type}`, diff);
    return after;
  }

  remove(id: string) { return this.repo.remove(id); }

  // صرف نقدية على بضاعة — يوزّع المبلغ على بنود شراء الأصناف المختارة عن طريق زيادة
  // "الناولون" (freight) بتاعها، وده بيرفع صافي سعر التكلفة (avgCost) للأصناف دي.
  // بيرجّع وصف مختصر للتوزيع (للـ audit). لا يؤثر على رصيد الطرف ولا إجمالي الفاتورة.
  private async distributeGoodsCost(dto: PostEntryDto, amt: number, sign: number): Promise<string> {
    const mode = dto.goodsMode;
    const targets: { itemId: number; weight: number }[] = [];
    let summary = '';

    if (mode === 'invoices' && dto.invoiceIds?.length) {
      const items = await this.prisma.invoiceItem.findMany({
        where: { invoice: { uid: { in: dto.invoiceIds }, kind: 'PURCHASE', fake: false } },
        select: { id: true, qty: true },
      });
      for (const it of items) targets.push({ itemId: it.id, weight: it.qty > 0 ? it.qty : 1 });
      summary = `موزّع على ${dto.invoiceIds.length} فاتورة`;
    } else if ((mode === 'products' || mode === 'count') && dto.goodsItems?.length) {
      for (const gi of dto.goodsItems) {
        if (!gi?.productId) continue;
        // آخر بند شراء للصنف — avgCost بيجمع الناولون على كل البنود فمكانه مش فارق.
        const item = await this.prisma.invoiceItem.findFirst({
          where: { product: { uid: gi.productId }, invoice: { kind: 'PURCHASE', fake: false } },
          orderBy: { invoice: { date: 'desc' } },
          select: { id: true },
        });
        if (item) targets.push({ itemId: item.id, weight: mode === 'count' ? (gi.count && gi.count > 0 ? gi.count : 1) : 1 });
      }
      summary = `موزّع على ${targets.length} صنف`;
    }

    const totalWeight = targets.reduce((s, t) => s + t.weight, 0);
    if (totalWeight <= 0) return summary;
    for (const t of targets) {
      const share = amt * (t.weight / totalWeight) * sign;
      await this.prisma.invoiceItem.update({ where: { id: t.itemId }, data: { freight: { increment: share } } });
    }
    return summary;
  }

  private requirePart(value: string | undefined, label: string) {
    if (!value) throw new BadRequestException(`اختر ${label}`);
  }

  // صاحب العهدة — طرف بدور PERSON. لو اتبعت partyId نستخدمه، وإلا نلاقي الاسم أو نعمله جديد.
  private async resolvePerson(dto: PostEntryDto): Promise<{ uid: string; name: string }> {
    if (dto.partyId) {
      const p = await this.prisma.party.findUnique({ where: { uid: dto.partyId }, select: { uid: true, name: true } });
      if (p) return p;
    }
    const name = (dto.holderName || '').trim();
    if (!name) throw new BadRequestException('اكتب اسم صاحب العهدة');
    const existing = await this.prisma.party.findFirst({ where: { name, role: 'PERSON' }, select: { uid: true, name: true } });
    if (existing) return existing;
    return this.prisma.party.create({ data: { name, role: 'PERSON' }, select: { uid: true, name: true } });
  }

  private requireTreasuryAllowed(treasuryUid: string | undefined, user?: any) {
    if (!treasuryUid || !user || user.admin) return;
    const allowed: string[] = user.treasuryIds ?? [];
    if (allowed.length && !allowed.includes(treasuryUid)) {
      throw new ForbiddenException('غير مصرح لك بالتعامل مع هذه الخزينة');
    }
  }

  // Money movements are compound/multi-leg and need real party/treasury names in
  // the message, which the generic URL-based AuditInterceptor can't build from a
  // flat response body — so transactions log themselves directly. See
  // AuditInterceptor's early-return for entity === 'transactions' (CREATE/UPDATE).
  private logTxn(
    user: any,
    action: 'CREATE' | 'UPDATE',
    entityUid: string | null,
    summary: string | null,
    diff?: Record<string, { from: any; to: any }>,
  ) {
    if (!user?.name) return;
    this.prisma.auditLog
      .create({
        data: {
          userName: user.name,
          action,
          entity: 'transactions',
          entityUid,
          summary,
          ...(diff && Object.keys(diff).length ? { diff } : {}),
        },
      })
      .catch(() => undefined);
  }

  private diffTxn(before: any, after: any): Record<string, { from: any; to: any }> {
    const changes: Record<string, { from: any; to: any }> = {};

    const amtOf = (t: any) => t.debit || t.credit || t.cashIn || t.cashOut || 0;
    const beforeAmt = amtOf(before);
    const afterAmt = amtOf(after);
    if (beforeAmt !== afterAmt) changes['المبلغ'] = { from: beforeAmt, to: afterAmt };

    const dateOf = (t: any) => new Date(t.date).toISOString().slice(0, 10);
    if (dateOf(before) !== dateOf(after)) changes['التاريخ'] = { from: dateOf(before), to: dateOf(after) };

    const beforeNote = before.note ?? null;
    const afterNote = after.note ?? null;
    if (beforeNote !== afterNote) changes['ملاحظة'] = { from: beforeNote, to: afterNote };

    const beforeParty = before.party?.name ?? null;
    const afterParty = after.party?.name ?? null;
    if (beforeParty !== afterParty) changes['الطرف'] = { from: beforeParty, to: afterParty };

    const beforeTreasury = before.treasury?.name ?? null;
    const afterTreasury = after.treasury?.name ?? null;
    if (beforeTreasury !== afterTreasury) changes['الخزينة'] = { from: beforeTreasury, to: afterTreasury };

    return changes;
  }
}
