import { ConflictException, Injectable } from '@nestjs/common';
import { InvoiceKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { CreateInvoiceDto, UpdateInvoiceDto, CommissionDto } from './dto/invoices.dto';

const INVOICE_INCLUDE = { items: { include: { product: true, commissionParty: { select: { uid: true, name: true } }, freightTreasury: { select: { uid: true, name: true } }, teaTreasury: { select: { uid: true, name: true } } } }, party: true, warehouse: true } as const;

@Injectable()
export class InvoicesRepository {
  constructor(private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto, kind?: InvoiceKind, partyId?: string) {
    const where: any = {};
    if (kind) where.kind = kind;
    // فواتير طرف بعينه — بيستخدمها عرض «تابات فواتير العميل» بدل البحث بالاسم.
    if (partyId) where.party = { uid: partyId };
    if (q.search) where.OR = [
      { no: { contains: q.search } },
      { party: { name: { contains: q.search, mode: 'insensitive' } } },
    ];
    if (q.from || q.to) where.date = {
      gte: q.from ? new Date(q.from) : undefined,
      lt: q.to ? new Date(new Date(q.to).getTime() + 86400000) : undefined,
    };
    return paginate(this.prisma.invoice, q, {
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { party: true, warehouse: true, items: { include: { product: true, commissionParty: { select: { uid: true, name: true } }, freightTreasury: { select: { uid: true, name: true } }, teaTreasury: { select: { uid: true, name: true } } } } },
    });
  }

  findOne(id: string) {
    return this.prisma.invoice.findUnique({
      where: { uid: id },
      include: { party: true, warehouse: true, treasury: true, items: { include: { product: true, commissionParty: { select: { uid: true, name: true } }, freightTreasury: { select: { uid: true, name: true } }, teaTreasury: { select: { uid: true, name: true } } } } },
    });
  }

  async create(dto: CreateInvoiceDto, computed: { total: number; paid: number; discount: number; isSale: boolean; createdById?: number }) {
    const { total, paid, discount, isSale, createdById } = computed;
    const date = new Date(dto.date);
    const autoNo = !dto.no?.trim();

    // لو رقمين اتولدوا في نفس اللحظة لنفس الطرف، قيد @@unique([partyId,no]) بيرمي P2002 —
    // نعيد المحاولة (nextNo هيقرأ max الجديد) لحد ما ينجح. رقم يدوي مكرر بيرمي خطأ واضح.
    const run = () => this.prisma.$transaction(async (tx) => {
      const [party, warehouse, treasury] = await Promise.all([
        tx.party.findUniqueOrThrow({ where: { uid: dto.partyId }, select: { id: true, currency: true } }),
        tx.warehouse.findUniqueOrThrow({ where: { uid: dto.warehouseId }, select: { id: true } }),
        dto.treasuryId
          ? tx.treasuryAccount.findUniqueOrThrow({ where: { uid: dto.treasuryId }, select: { id: true } })
          : Promise.resolve(null),
      ]);
      const { create: itemsCreate, resolved: resolvedItems } = await this.buildItems(tx, dto.items);
      const no = dto.no?.trim() || (await this.nextNo(tx, party.id));

      // Exchange rate only meaningful on a USD (dollar) party's invoice.
      const rate = party.currency === 'USD' ? (dto.exchangeRate || null) : null;
      const invoice = await tx.invoice.create({
        data: {
          kind: dto.kind,
          no,
          date,
          currency: party.currency,
          exchangeRate: rate,
          partyId: party.id,
          warehouseId: warehouse.id,
          paid,
          discount,
          fake: !!dto.fake,
          treasuryId: treasury?.id ?? null,
          note: dto.note,
          commissionAmount: null,
          commissionTo: null,
          items: { create: itemsCreate },
        },
      });

      // Fake invoice = document only: no ledger/treasury movements at all.
      const txns = dto.fake ? [] : this.buildTxns(invoice.id, { party, treasury, date, no, total, paid, discount, isSale, items: resolvedItems, createdById, exchangeRate: rate ?? 0 });
      if (txns.length) await tx.transaction.createMany({ data: txns });

      return tx.invoice.findUnique({ where: { id: invoice.id }, include: INVOICE_INCLUDE });
    });

    for (let attempt = 0; ; attempt++) {
      try { return await run(); }
      catch (e: any) {
        if (e?.code === 'P2002' && autoNo && attempt < 4) continue;
        if (e?.code === 'P2002') throw new ConflictException('رقم الفاتورة مستخدم بالفعل لهذا الطرف');
        throw e;
      }
    }
  }

  async update(id: string, dto: UpdateInvoiceDto, computed: { total: number; paid: number; discount: number; createdById?: number }) {
    const { total, paid, discount, createdById } = computed;
    const date = new Date(dto.date);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.invoice.findUniqueOrThrow({ where: { uid: id }, select: { id: true, kind: true, no: true, commissionAmount: true, commissionTo: true } });
      const { id: invId, kind, no } = existing;
      const isSale = kind === InvoiceKind.SALE;

      // نمسح كل الحركات ونعيد بناء عمولات البنود من buildTxns، بس نحفظ عمولة الفاتورة (اللي
      // اتسجّلت من شاشة التفاصيل updateCommission) ونعيد ترحيلها بعدين — قبل كده كانت بتتمسح.
      await tx.transaction.deleteMany({ where: { invoiceId: invId } });

      const [party, warehouse, treasury] = await Promise.all([
        tx.party.findUniqueOrThrow({ where: { uid: dto.partyId }, select: { id: true, currency: true } }),
        tx.warehouse.findUniqueOrThrow({ where: { uid: dto.warehouseId }, select: { id: true } }),
        dto.treasuryId
          ? tx.treasuryAccount.findUniqueOrThrow({ where: { uid: dto.treasuryId }, select: { id: true } })
          : Promise.resolve(null),
      ]);
      const { create: itemsCreate, resolved: resolvedItems } = await this.buildItems(tx, dto.items);

      const rate = party.currency === 'USD' ? (dto.exchangeRate || null) : null;
      await tx.invoice.update({
        where: { id: invId },
        data: {
          date,
          currency: party.currency,
          exchangeRate: rate,
          partyId: party.id,
          warehouseId: warehouse.id,
          paid,
          discount,
          fake: !!dto.fake,
          treasuryId: treasury?.id ?? null,
          note: dto.note ?? null,
          // متتصفّرش العمولة — بتفضل زي ما هي (بتتظبط من updateCommission بس).
          items: { deleteMany: {}, create: itemsCreate },
        },
      });

      const txns = dto.fake ? [] : this.buildTxns(invId, { party, treasury, date, no, total, paid, discount, isSale, items: resolvedItems, createdById, exchangeRate: rate ?? 0 });
      if (txns.length) await tx.transaction.createMany({ data: txns });

      // إعادة ترحيل عمولة الفاتورة المحفوظة (لو موجودة) — لأن deleteMany مسحت صفها فوق.
      if (!dto.fake && existing.commissionAmount && existing.commissionAmount > 0 && existing.commissionTo) {
        const cp = await tx.party.findFirst({ where: { name: existing.commissionTo }, select: { id: true } });
        if (cp) {
          await tx.transaction.create({
            data: { date, type: 'commission', partyId: cp.id, credit: existing.commissionAmount, note: `عمولة فاتورة #${no}`, invoiceId: invId },
          });
        }
      }

      return tx.invoice.findUnique({ where: { id: invId }, include: INVOICE_INCLUDE });
    });
  }

  async updateCommission(uid: string, dto: CommissionDto) {
    const inv = await this.prisma.invoice.findUniqueOrThrow({ where: { uid }, select: { id: true, date: true, no: true } });
    return this.prisma.$transaction(async (tx) => {
      await tx.transaction.deleteMany({ where: { invoiceId: inv.id, type: 'commission' } });
      if (dto.commissionAmount && dto.commissionAmount > 0 && dto.commissionPartyId) {
        const cp = await tx.party.findUniqueOrThrow({ where: { uid: dto.commissionPartyId }, select: { id: true, name: true } });
        await tx.transaction.create({
          data: { date: inv.date, type: 'commission', partyId: cp.id, credit: dto.commissionAmount, note: `عمولة فاتورة #${inv.no}`, invoiceId: inv.id },
        });
        await tx.invoice.update({ where: { id: inv.id }, data: { commissionAmount: dto.commissionAmount, commissionTo: cp.name } });
      } else {
        await tx.invoice.update({ where: { id: inv.id }, data: { commissionAmount: null, commissionTo: null } });
      }
    });
  }

  // بيانات "شكل الشيت" للفاتورة: الحساب القديم قبلها، والسدادات اللي بعدها لحد الفاتورة
  // اللي تليها لنفس الطرف، والباقي عليه — بنفس ترتيب كشف الحساب (date ثم createdAt).
  async sheet(uid: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { uid },
      select: {
        id: true, no: true, date: true, kind: true, createdAt: true, currency: true,
        party: {
          select: {
            id: true, opening: true,
            linkedParty: { select: { id: true, opening: true } },
            linkedFrom: { select: { id: true, opening: true } },
          },
        },
      },
    });
    if (!inv) return null;

    // الطرف المرتبط (عميل/مورد بكشف واحد) بيتحسب مع الطرف زي كشف الحساب بالظبط.
    const partner = inv.party.linkedParty ?? inv.party.linkedFrom ?? null;
    const partyIds = partner ? [inv.party.id, partner.id] : [inv.party.id];
    const opening = (inv.party.opening || 0) + (partner?.opening || 0);

    const txns = await this.prisma.transaction.findMany({
      where: { partyId: { in: partyIds } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { uid: true, date: true, type: true, note: true, clientNote: true, debit: true, credit: true, cashIn: true, cashOut: true, invoiceId: true },
    });

    // نقطة البداية = أول حركة للفاتورة دي. الفاتورة الوهمية مالهاش حركات، فبنرجع لأول
    // حركة بتاريخ أحدث من تاريخها.
    let start = txns.findIndex((t) => t.invoiceId === inv.id);
    if (start < 0) {
      start = txns.findIndex((t) => t.date > inv.date);
      if (start < 0) start = txns.length;
    }

    // نقطة النهاية = أول حركة للفاتورة اللي بعدها لنفس الطرف (أو آخر الكشف).
    const nextInv = await this.prisma.invoice.findFirst({
      where: {
        partyId: { in: partyIds },
        OR: [{ date: { gt: inv.date } }, { date: inv.date, createdAt: { gt: inv.createdAt } }],
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, no: true, date: true },
    });
    let end = txns.length;
    if (nextInv) {
      // الفاتورة اللي بعدها وهمية؟ مالهاش حركات — فبنقفل الفترة عند تاريخها.
      let i = txns.findIndex((t, idx) => idx > start && t.invoiceId === nextInv.id);
      if (i < 0) i = txns.findIndex((t, idx) => idx > start && t.date >= nextInv.date);
      if (i >= 0) end = i;
    }

    let previousBalance = opening;
    for (let i = 0; i < start; i++) previousBalance += (txns[i].debit || 0) - (txns[i].credit || 0);

    let remaining = previousBalance;
    for (let i = start; i < end; i++) remaining += (txns[i].debit || 0) - (txns[i].credit || 0);

    const isSale = inv.kind === InvoiceKind.SALE;
    const win = txns.slice(start, end);

    // السدادات = استلامات نقدية بس (فلوس عدّت فعلاً من/إلى خزنة). المرتجعات والخصومات
    // والمصاريف بتفضل في كشف الحساب بره الفاتورة — زي الشيت بالظبط.
    const payments = win
      .filter((t) => ((isSale ? t.credit : t.debit) || 0) > 0 && ((t.cashIn || 0) > 0 || (t.cashOut || 0) > 0))
      .map((t) => ({
        id: t.uid,
        date: t.date,
        type: t.type,
        note: t.note ?? null,
        clientNote: t.clientNote ?? null,
        amount: (isSale ? t.credit : t.debit) || 0,
      }));
    const paymentsTotal = payments.reduce((s, p) => s + p.amount, 0);

    // نقل نقدية = رسوم نقل النقدية اللي بتتسجّل مع التحصيل (بتزوّد المستحق على الطرف).
    const cashTransfer = win
      .filter((t) => t.type === 'رسوم نقل')
      .reduce((s, t) => s + ((isSale ? t.debit : t.credit) || 0), 0);

    return {
      previousBalance,
      remaining,
      cashTransfer,
      payments,
      paymentsTotal,
      nextInvoiceNo: nextInv?.no ?? null,
      currency: inv.currency,
    };
  }

  // نفس أرقام الشيت بس بصياغة العميل — مقصورة على طرفه (أو الطرف المربوط بيه)، ومن غير
  // أي بيانات داخلية (مخزن، عمولات، بيان التحصيل الداخلي).
  async clientInvoice(partyUid: string, invoiceUid: string) {
    const party = await this.prisma.party.findUnique({
      where: { uid: partyUid },
      select: { id: true, linkedPartyId: true, linkedFrom: { select: { id: true } } },
    });
    if (!party) return null;
    const allowed = new Set<number>([party.id]);
    if (party.linkedPartyId) allowed.add(party.linkedPartyId);
    if (party.linkedFrom) allowed.add(party.linkedFrom.id);

    const inv = await this.prisma.invoice.findUnique({
      where: { uid: invoiceUid },
      select: {
        partyId: true, date: true, discount: true, fake: true, currency: true,
        items: { select: { qty: true, price: true, product: { select: { name: true } } } },
      },
    });
    // الفاتورة الوهمية مالهاش حركات — العميل مايشوفهاش أصلاً في كشفه.
    if (!inv || inv.fake || !allowed.has(inv.partyId)) return null;

    const s = await this.sheet(invoiceUid);
    if (!s) return null;

    const discount = inv.discount || 0;
    const itemsTotal = inv.items.reduce((sum, it) => sum + it.qty * it.price, 0) - discount;
    return {
      date: inv.date,
      currency: inv.currency,
      items: inv.items.map((it) => ({ name: it.product.name, qty: it.qty, price: it.price })),
      itemsTotal,
      discount,
      previousBalance: s.previousBalance,
      cashTransfer: s.cashTransfer,
      payments: s.payments.map((p) => ({ id: p.id, date: p.date, amount: p.amount, note: p.clientNote || 'استلام نقدية' })),
      paymentsTotal: s.paymentsTotal,
      remaining: s.remaining,
    };
  }

  /** الأطراف اللي حساب العميل ده مسموح له يشوفها (هو + المرتبط بيه في كشف واحد). */
  private async allowedPartyIds(partyUid: string): Promise<number[] | null> {
    const party = await this.prisma.party.findUnique({
      where: { uid: partyUid },
      select: { id: true, linkedPartyId: true, linkedFrom: { select: { id: true } } },
    });
    if (!party) return null;
    const ids = new Set<number>([party.id]);
    if (party.linkedPartyId) ids.add(party.linkedPartyId);
    if (party.linkedFrom) ids.add(party.linkedFrom.id);
    return [...ids];
  }

  /** فواتير العميل نفسه — أقدم أولاً عشان ترتيب التابات في البوابة. الوهمية مستبعدة. */
  async clientInvoiceList(partyUid: string) {
    const ids = await this.allowedPartyIds(partyUid);
    if (!ids) return [];
    return this.prisma.invoice.findMany({
      where: { partyId: { in: ids }, fake: false },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: { uid: true, no: true, date: true, currency: true },
    });
  }

  /** تأكيد إن الفاتورة دي فعلاً بتاعة العميل الداخل — قبل ما نرجّع أي تفاصيل. */
  async invoiceBelongsToClient(partyUid: string, invoiceUid: string) {
    const ids = await this.allowedPartyIds(partyUid);
    if (!ids) return false;
    const inv = await this.prisma.invoice.findUnique({
      where: { uid: invoiceUid },
      select: { partyId: true, fake: true },
    });
    return !!inv && !inv.fake && ids.includes(inv.partyId);
  }

  findByUid(id: string) {
    return this.prisma.invoice.findUnique({ where: { uid: id }, select: { id: true } });
  }

  countRelatedTransactions(id: number) {
    return this.prisma.transaction.count({ where: { invoiceId: id } });
  }

  remove(id: string) {
    return this.prisma.invoice.delete({ where: { uid: id } });
  }

  async nextNo(tx: Prisma.TransactionClient, partyId: number): Promise<string> {
    const rows = await tx.invoice.findMany({ where: { partyId }, select: { no: true } });
    const max = rows.reduce((mx, r) => {
      const n = parseInt(r.no, 10);
      return Number.isFinite(n) && n > mx ? n : mx;
    }, 0);
    return String(max + 1);
  }

  async peekNextNo(partyUid: string): Promise<{ no: string }> {
    const party = await this.prisma.party.findUnique({ where: { uid: partyUid }, select: { id: true } });
    if (!party) return { no: '1' };
    const rows = await this.prisma.invoice.findMany({ where: { partyId: party.id }, select: { no: true } });
    const max = rows.reduce((mx, r) => {
      const n = parseInt(r.no, 10);
      return Number.isFinite(n) && n > mx ? n : mx;
    }, 0);
    return { no: String(max + 1) };
  }

  // Resolve invoice items: map product/commission-party uids to ids, compute each item's
  // commission (عدد × سعر), and return both the Prisma create payload and a light "resolved"
  // list (freight/tea/commission/recipient) used to build the linked money movements.
  private async buildItems(tx: Prisma.TransactionClient, items: CreateInvoiceDto['items']) {
    const productUids = items.map((it) => it.productId);
    const commUids = [...new Set(items.map((it) => it.commissionPartyId).filter(Boolean) as string[])];
    const trUids = [...new Set(items.flatMap((it) => [it.freightTreasuryId, it.teaTreasuryId]).filter(Boolean) as string[])];
    const [products, commParties, treasuries] = await Promise.all([
      tx.product.findMany({ where: { uid: { in: productUids } }, select: { id: true, uid: true } }),
      commUids.length
        ? tx.party.findMany({ where: { uid: { in: commUids } }, select: { id: true, uid: true } })
        : Promise.resolve([] as { id: number; uid: string }[]),
      trUids.length
        ? tx.treasuryAccount.findMany({ where: { uid: { in: trUids } }, select: { id: true, uid: true } })
        : Promise.resolve([] as { id: number; uid: string }[]),
    ]);
    const pById = new Map(products.map((p) => [p.uid, p.id]));
    const cById = new Map(commParties.map((p) => [p.uid, p.id]));
    const tById = new Map(treasuries.map((t) => [t.uid, t.id]));

    const create: Prisma.InvoiceItemCreateWithoutInvoiceInput[] = [];
    const resolved: {
      freight: number; tea: number; commission: number; commissionPartyId: number | null;
      freightTreasuryId: number | null; freightNote: string | null; teaTreasuryId: number | null; teaNote: string | null;
    }[] = [];
    for (const it of items) {
      const commQty = it.commissionQty ?? 0;
      const commPrice = it.commissionPrice ?? 0;
      const commission = commQty * commPrice;
      const commissionPartyId = it.commissionPartyId ? (cById.get(it.commissionPartyId) ?? null) : null;
      const freight = it.freight ?? 0;
      const tea = it.tea ?? 0;
      const freightTreasuryId = it.freightTreasuryId ? (tById.get(it.freightTreasuryId) ?? null) : null;
      const teaTreasuryId = it.teaTreasuryId ? (tById.get(it.teaTreasuryId) ?? null) : null;
      const freightNote = it.freightNote?.trim() || null;
      const teaNote = it.teaNote?.trim() || null;
      create.push({
        product: { connect: { id: pById.get(it.productId)! } },
        qty: it.qty, price: it.price,
        freight, tea, commission, commissionQty: commQty, commissionPrice: commPrice,
        freightNote, teaNote,
        ...(commissionPartyId ? { commissionParty: { connect: { id: commissionPartyId } } } : {}),
        ...(freightTreasuryId ? { freightTreasury: { connect: { id: freightTreasuryId } } } : {}),
        ...(teaTreasuryId ? { teaTreasury: { connect: { id: teaTreasuryId } } } : {}),
      });
      resolved.push({ freight, tea, commission, commissionPartyId, freightTreasuryId, freightNote, teaTreasuryId, teaNote });
    }
    return { create, resolved };
  }

  private buildTxns(
    invoiceId: number,
    p: {
      party: { id: number }; treasury: { id: number } | null;
      date: Date; no: string; total: number; paid: number; discount: number; isSale: boolean;
      items: {
        freight: number; tea: number; commission: number; commissionPartyId: number | null;
        freightTreasuryId: number | null; freightNote: string | null; teaTreasuryId: number | null; teaNote: string | null;
      }[];
      createdById?: number; exchangeRate?: number;
    },
  ): Prisma.TransactionCreateManyInput[] {
    const { party, treasury, date, no, total, paid, discount, isSale, items, createdById, exchangeRate } = p;
    // The party owes/us the invoice total minus any discount.
    const net = total - (discount || 0);
    const discNote = discount > 0 ? ` (بعد خصم ${discount})` : '';
    const txns: Prisma.TransactionCreateManyInput[] = [];
    // نختم سعر صرف الفاتورة على معاملة الطرف الرئيسية (فاتورة بيع/شراء) عشان متوسط سعر
    // صرف الطرف الدولاري يتحسب صح في الميزان وكشف الحساب. صفر لو الطرف بالمصري.
    const usd = exchangeRate && exchangeRate > 0 ? { exchangeRate } : {};
    if (isSale) {
      txns.push({ date, type: 'فاتورة بيع', partyId: party.id, debit: net, note: `فاتورة بيع #${no}${discNote}`, invoiceId, ...usd });
      if (paid > 0) txns.push({ date, type: 'تحصيل', partyId: party.id, treasuryId: treasury?.id ?? null, credit: paid, cashIn: paid, note: `محصّل مع فاتورة #${no}`, invoiceId });
    } else {
      txns.push({ date, type: 'فاتورة شراء', partyId: party.id, credit: net, note: `فاتورة شراء #${no}${discNote}`, invoiceId, ...usd });
      if (paid > 0) txns.push({ date, type: 'دفعة لمورد', partyId: party.id, treasuryId: treasury?.id ?? null, debit: paid, cashOut: paid, note: `مدفوع مع فاتورة #${no}`, invoiceId });
    }
    // ناولون/شاي كل واحد بيتدفع نقدًا من خزينته المختارة (fallback خزينة الفاتورة) وببيانه الخاص،
    // ويُضاف لصافي تكلفة الصنف عبر freight/tea.
    for (const it of items) {
      const fTr = it.freightTreasuryId ?? treasury?.id ?? null;
      if ((it.freight || 0) > 0 && fTr) {
        // ناولون الفاتورة = ناولون داخلي (بيتجمّع تحت مصاريف خارجية في التقرير)
        txns.push({ date, type: 'ناولون', treasuryId: fTr, cashOut: it.freight, note: it.freightNote || `ناولون داخلي فاتورة #${no}`, invoiceId });
      }
      const tTr = it.teaTreasuryId ?? treasury?.id ?? null;
      if ((it.tea || 0) > 0 && tTr) {
        txns.push({ date, type: 'شاي', treasuryId: tTr, cashOut: it.tea, note: it.teaNote || `شاي فاتورة #${no}`, invoiceId });
      }
    }
    // عمولة كل بند: تترحّل تلقائيًا لحساب صاحبها (دائن — مستحقة له).
    for (const it of items) {
      if ((it.commission || 0) > 0 && it.commissionPartyId) {
        txns.push({ date, type: 'commission', partyId: it.commissionPartyId, credit: it.commission, note: `عمولة فاتورة #${no}`, invoiceId });
      }
    }
    // Attribute every generated movement to the user, and stamp the USD exchange rate
    // (0 for EGP invoices) so the party's average rate can be weighted later.
    return txns.map((t) => ({ ...t, ...(createdById ? { createdById } : {}), ...(exchangeRate ? { exchangeRate } : {}) }));
  }

  // ---- تابات العربيات جوّه الفاتورة ----

  /** الفاتورة + طرفها + بنودها + عربياتها مرتّبة بالتاريخ — مصدر تابات العربيات. */
  invoiceWithManifests(uid: string) {
    return this.prisma.invoice.findUnique({
      where: { uid },
      select: {
        id: true, uid: true, no: true, date: true, currency: true, partyId: true,
        items: { select: { qty: true, price: true, product: { select: { name: true } } } },
        manifests: {
          orderBy: [{ date: 'asc' }, { id: 'asc' }],
          select: {
            // بيانات الكشف بالكامل — التاب بيرسم نفس شكل كشف العربية المطبوع بالظبط.
            id: true, uid: true, no: true, date: true, clientName: true,
            vehicleNo: true, vehicleLabel: true, trailerNo: true,
            driverName: true, driverNID: true, driverPhone: true,
            note: true, closedAt: true, closedBy: true,
            items: { select: { uid: true, name: true, qty: true } },
            // وصلت ولا لسه في الطريق — منها لون التاب والكشف
            driverTrips: { select: { arrivalDate: true } },
          },
        },
      },
    });
  }

  /**
   * مصاريف مرشّحة للفاتورة: أي حركة مصروف متثبّتة على عربية من عربيات الفاتورة، أو
   * مصروف مربوط بالفاتورة/بطرفها لسه مش متثبّت على عربية تانية. الفرز بالتاريخ عشان
   * توزيعها على النوافذ الزمنية يبقى ترتيبه صح.
   */
  manifestExpenseCandidates(invoiceId: number, partyId: number, manifestIds: number[]) {
    return this.prisma.transaction.findMany({
      where: {
        type: { startsWith: 'مصروف' },
        OR: [
          ...(manifestIds.length ? [{ manifestId: { in: manifestIds } }] : []),
          { manifestId: null, OR: [{ invoiceId }, { partyId }] },
        ],
      },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      select: {
        uid: true, date: true, type: true, note: true, manifestId: true,
        debit: true, cashOut: true, expAmt: true,
        category: { select: { uid: true, name: true } },
        treasury: { select: { uid: true, name: true } },
      },
    });
  }

  manifestForTab(uid: string) {
    return this.prisma.manifest.findUnique({
      where: { uid },
      select: { id: true, uid: true, no: true, closedAt: true, closedBy: true, invoiceId: true },
    });
  }

  setManifestClosed(id: number, closedAt: Date | null, closedBy: string | null) {
    return this.prisma.manifest.update({ where: { id }, data: { closedAt, closedBy } });
  }
}
