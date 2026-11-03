import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { INVOICE_CHARGES_TX_TYPE } from '../../common/activity';
import { assertCashCurrency } from '../../common/currency-guard';
import { CreateDealDto, DealCommissionDto } from './dto/deals.dto';

const DEAL_INCLUDE = {
  client: true, supplier: true, treasury: true,
  items: { orderBy: { id: 'asc' }, include: { product: true, commissionParty: { select: { uid: true, name: true } }, freightTreasury: { select: { uid: true, name: true } }, teaTreasury: { select: { uid: true, name: true } } } },
  charges: { orderBy: { id: 'asc' }, include: { chargeType: { select: { uid: true, name: true } }, manifest: { select: { uid: true, no: true } } } },
  manifests: { select: { uid: true, no: true, date: true, vehicleNo: true, driverName: true }, orderBy: { date: 'asc' } },
  driverTrip: { select: { uid: true, driverName: true, departureDate: true } },
} as const;

@Injectable()
export class DealsRepository {
  constructor(private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto) {
    const where: any = {};
    if (q.search) where.OR = [
      { no: { contains: q.search } },
      { client: { name: { contains: q.search, mode: 'insensitive' } } },
      { supplier: { name: { contains: q.search, mode: 'insensitive' } } },
    ];
    if (q.from || q.to) where.date = {
      gte: q.from ? new Date(q.from) : undefined,
      lt: q.to ? new Date(new Date(q.to).getTime() + 86400000) : undefined,
    };
    return paginate(this.prisma.deal, q, { where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], include: DEAL_INCLUDE });
  }

  findOne(uid: string) {
    return this.prisma.deal.findUniqueOrThrow({ where: { uid }, include: DEAL_INCLUDE });
  }

  async create(dto: CreateDealDto, createdById?: number) {
    const autoNo = !dto.no?.trim();
    // نفس فكرة الفواتير — قيد @@unique([clientId,no]) بيمنع تكرار الرقم من التسابق، ونعيد المحاولة.
    const run = () => this.prisma.$transaction(async (tx) => {
      const { client, supplier, treasury, commissionParty, no } = await this.resolve(tx, dto, null);
      const { create: itemsCreate, resolved: resolvedItems } = await this.buildDealItems(tx, dto.items);
      const { create: chargesCreate, names: chargeNames } = await this.buildCharges(tx, dto.charges);
      const { date, paidIn, paidOut, nawlon, sellTotal, buyTotal, chargesTotal, exchangeRate } = this.amounts(dto);
      if (treasury && paidIn > 0) assertCashCurrency(client.currency, treasury.currency);
      if (treasury && paidOut > 0) assertCashCurrency(supplier.currency, treasury.currency);

      const deal = await tx.deal.create({
        data: {
          no, date, clientId: client.id, supplierId: supplier.id,
          paidIn, paidOut, nawlon, treasuryId: treasury?.id ?? null, note: dto.note, exchangeRate,
          items: { create: itemsCreate },
          charges: { create: chargesCreate },
        },
      });

      await tx.transaction.createMany({ data: this.txns(deal.id, { client, supplier, treasury, commissionParty, date, no, sellTotal, buyTotal, chargesTotal, chargeNames, exchangeRate, paidIn, paidOut, nawlon, dto, items: resolvedItems, createdById }) });
      return tx.deal.findUnique({ where: { id: deal.id }, include: DEAL_INCLUDE });
    });

    for (let attempt = 0; ; attempt++) {
      try { return await run(); }
      catch (e: any) {
        if (e?.code === 'P2002' && autoNo && attempt < 4) continue;
        if (e?.code === 'P2002') throw new ConflictException('رقم العملية مستخدم بالفعل لهذا العميل');
        throw e;
      }
    }
  }

  async update(uid: string, dto: CreateDealDto, createdById?: number) {
    const existing = await this.prisma.deal.findUniqueOrThrow({ where: { uid }, select: { id: true, no: true, paidIn: true, paidOut: true, treasuryId: true, clientId: true, supplierId: true } });
    const dealId = existing.id;

    return this.prisma.$transaction(async (tx) => {
      const { client, supplier, treasury, commissionParty, no } = await this.resolve(tx, dto, existing.no);
      const { create: itemsCreate, resolved: resolvedItems } = await this.buildDealItems(tx, dto.items);
      const { create: chargesCreate, names: chargeNames } = await this.buildCharges(tx, dto.charges);
      const { date, paidIn, paidOut, nawlon, sellTotal, buyTotal, chargesTotal, exchangeRate } = this.amounts(dto);
      // مبلغ قديم لم يتغيّر يبقى كما هو، حتى يمكن تعديل باقي العملية.
      const sameTreasury = existing.treasuryId === (treasury?.id ?? null);
      if (treasury && paidIn > 0 && !(sameTreasury && existing.paidIn === paidIn && existing.clientId === client.id)) assertCashCurrency(client.currency, treasury.currency);
      if (treasury && paidOut > 0 && !(sameTreasury && existing.paidOut === paidOut && existing.supplierId === supplier.id)) assertCashCurrency(supplier.currency, treasury.currency);

      // عمولة الصفقة على مستوى العملية (اللي اتسجّلت من شاشة الصفقات updateCommission) ليها بيان
      // "commission صفقة" — نحفظها قبل المسح ونعيد ترحيلها، وإلا تعديل الصفقة كان بيلغيها.
      const prevComm = await tx.transaction.findFirst({
        where: { dealId, type: 'commission', note: { startsWith: 'commission صفقة' } },
        select: { partyId: true, credit: true },
      });

      await tx.transaction.deleteMany({ where: { dealId } });
      await tx.dealItem.deleteMany({ where: { dealId } });

      await tx.deal.update({
        where: { id: dealId },
        data: {
          no, date, clientId: client.id, supplierId: supplier.id,
          paidIn, paidOut, nawlon, treasuryId: treasury?.id ?? null, note: dto.note, exchangeRate,
          items: { create: itemsCreate },
          charges: { deleteMany: {}, create: chargesCreate },
        },
      });

      await tx.transaction.createMany({ data: this.txns(dealId, { client, supplier, treasury, commissionParty, date, no, sellTotal, buyTotal, chargesTotal, chargeNames, exchangeRate, paidIn, paidOut, nawlon, dto, items: resolvedItems, createdById }) });

      // إعادة ترحيل عمولة العملية المحفوظة لو الـ dto ماجابش عمولة جديدة (txns بتعيد بناء عمولة الـ dto لو موجودة).
      if (prevComm?.partyId && prevComm.credit && !(dto.commissionAmount && dto.commissionAmount > 0)) {
        await tx.transaction.create({ data: { date, type: 'commission', partyId: prevComm.partyId, credit: prevComm.credit, note: `commission صفقة #${no}`, dealId } });
      }
      return tx.deal.findUnique({ where: { id: dealId }, include: DEAL_INCLUDE });
    });
  }

  async updateCommission(uid: string, dto: DealCommissionDto) {
    const deal = await this.prisma.deal.findUniqueOrThrow({ where: { uid }, select: { id: true, date: true, no: true } });
    return this.prisma.$transaction(async (tx) => {
      await tx.transaction.deleteMany({ where: { dealId: deal.id, type: 'commission' } });
      if (dto.commissionAmount && dto.commissionAmount > 0 && dto.commissionPartyId) {
        const cp = await tx.party.findUniqueOrThrow({ where: { uid: dto.commissionPartyId }, select: { id: true } });
        await tx.transaction.create({
          data: { date: deal.date, type: 'commission', partyId: cp.id, credit: dto.commissionAmount, note: `commission صفقة #${deal.no}`, dealId: deal.id },
        });
      }
    });
  }

  remove(id: string) {
    return this.prisma.deal.delete({ where: { uid: id } });
  }

  async peekNextNo(clientUid: string): Promise<{ no: string }> {
    const client = await this.prisma.party.findUnique({ where: { uid: clientUid }, select: { id: true } });
    if (!client) return { no: '1' };
    const rows = await this.prisma.deal.findMany({ where: { clientId: client.id }, select: { no: true } });
    const max = rows.reduce((mx, r) => {
      const n = parseInt(r.no, 10);
      return Number.isFinite(n) && n > mx ? n : mx;
    }, 0);
    return { no: String(max + 1) };
  }

  private async resolve(tx: Prisma.TransactionClient, dto: CreateDealDto, fallbackNo: string | null) {
    if (!dto.items.length && !(dto.charges ?? []).some((c) => (c.qty ?? 1) * c.price !== 0)) {
      throw new BadRequestException('أضف صنفاً أو بند شحن واحداً على الأقل');
    }
    const [client, supplier, treasury] = await Promise.all([
      tx.party.findUniqueOrThrow({ where: { uid: dto.clientId }, select: { id: true, currency: true } }),
      tx.party.findUniqueOrThrow({ where: { uid: dto.supplierId }, select: { id: true, currency: true } }),
      dto.treasuryId
        ? tx.treasuryAccount.findUniqueOrThrow({ where: { uid: dto.treasuryId }, select: { id: true, currency: true } })
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
    const no = dto.no?.trim() || fallbackNo || (await this.nextNo(tx, client.id));
    return { client, supplier, treasury, commissionParty, productIdByUid, no };
  }

  // نفس منطق الفواتير: يحلّل بنود العملية (منتج/خزينة الناولون والشاي/صاحب العمولة) ويرجّع
  // payload الإنشاء + قائمة "resolved" لبناء الحركات المالية.
  private async buildDealItems(tx: Prisma.TransactionClient, items: CreateDealDto['items']) {
    const productUids = items.map((it) => it.productId);
    const commUids = [...new Set(items.map((it) => it.commissionPartyId).filter(Boolean) as string[])];
    const trUids = [...new Set(items.flatMap((it) => [it.freightTreasuryId, it.teaTreasuryId]).filter(Boolean) as string[])];
    const [products, commParties, treasuries] = await Promise.all([
      tx.product.findMany({ where: { uid: { in: productUids } }, select: { id: true, uid: true } }),
      commUids.length ? tx.party.findMany({ where: { uid: { in: commUids } }, select: { id: true, uid: true } }) : Promise.resolve([] as { id: number; uid: string }[]),
      trUids.length ? tx.treasuryAccount.findMany({ where: { uid: { in: trUids } }, select: { id: true, uid: true } }) : Promise.resolve([] as { id: number; uid: string }[]),
    ]);
    const pById = new Map(products.map((p) => [p.uid, p.id]));
    const cById = new Map(commParties.map((p) => [p.uid, p.id]));
    const tById = new Map(treasuries.map((t) => [t.uid, t.id]));

    const create: Prisma.DealItemCreateWithoutDealInput[] = [];
    const resolved: { freight: number; tea: number; commission: number; commissionPartyId: number | null; freightTreasuryId: number | null; freightNote: string | null; teaTreasuryId: number | null; teaNote: string | null }[] = [];
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
        qty: it.qty, price: it.price, buyPrice: it.buyPrice || 0,
        freight, tea, commission, commissionQty: commQty, commissionPrice: commPrice, freightNote, teaNote,
        ...(commissionPartyId ? { commissionParty: { connect: { id: commissionPartyId } } } : {}),
        ...(freightTreasuryId ? { freightTreasury: { connect: { id: freightTreasuryId } } } : {}),
        ...(teaTreasuryId ? { teaTreasury: { connect: { id: teaTreasuryId } } } : {}),
      });
      resolved.push({ freight, tea, commission, commissionPartyId, freightTreasuryId, freightNote, teaTreasuryId, teaNote });
    }
    return { create, resolved };
  }

  private amounts(dto: CreateDealDto) {
    const chargesTotal = (dto.charges ?? []).reduce((s, c) => s + (c.qty ?? 1) * c.price, 0);
    return {
      date: new Date(dto.date), paidIn: dto.paidIn || 0, paidOut: dto.paidOut || 0, nawlon: dto.nawlon || 0,
      sellTotal: dto.items.reduce((s, it) => s + it.qty * it.price, 0),
      buyTotal: dto.items.reduce((s, it) => s + it.qty * (it.buyPrice || 0), 0),
      chargesTotal,
      // العملية لا تحمل سعراً خاصاً بها: شراء المورد الدولاري يتسعّر من دفعات الوكيل (FIFO).
      exchangeRate: null,
    };
  }

  // بنود الشحن: نفس بناء بنود الفاتورة (uid البند والعربية → ids)، والأسماء لبيان الحركة.
  private async buildCharges(tx: Prisma.TransactionClient, charges: CreateDealDto['charges']) {
    const list = (charges ?? []).filter((c) => c.chargeTypeId && (c.qty ?? 1) * c.price !== 0);
    if (!list.length) return { create: [] as Prisma.DealChargeCreateWithoutDealInput[], names: [] as string[] };
    const typeUids = [...new Set(list.map((c) => c.chargeTypeId))];
    const manUids = [...new Set(list.map((c) => c.manifestId).filter(Boolean) as string[])];
    const [types, manifests] = await Promise.all([
      tx.chargeType.findMany({ where: { uid: { in: typeUids } }, select: { id: true, uid: true, name: true } }),
      manUids.length
        ? tx.manifest.findMany({ where: { uid: { in: manUids } }, select: { id: true, uid: true } })
        : Promise.resolve([] as { id: number; uid: string }[]),
    ]);
    const tByUid = new Map(types.map((t) => [t.uid, t]));
    const mByUid = new Map(manifests.map((m) => [m.uid, m.id]));
    const create: Prisma.DealChargeCreateWithoutDealInput[] = [];
    const names: string[] = [];
    for (const c of list) {
      const t = tByUid.get(c.chargeTypeId);
      if (!t) throw new NotFoundException('بند الشحن غير موجود');
      const manifestId = c.manifestId ? mByUid.get(c.manifestId) : undefined;
      create.push({
        chargeType: { connect: { id: t.id } },
        qty: c.qty ?? 1,
        price: c.price,
        note: c.note?.trim() || null,
        ...(manifestId ? { manifest: { connect: { id: manifestId } } } : {}),
      });
      if (!names.includes(t.name)) names.push(t.name);
    }
    return { create, names };
  }

  private async nextNo(tx: Prisma.TransactionClient, clientId?: number): Promise<string> {
    const where = clientId ? { clientId } : {};
    const rows = await tx.deal.findMany({ where, select: { no: true } });
    const max = rows.reduce((mx, r) => {
      const n = parseInt(r.no, 10);
      return Number.isFinite(n) && n > mx ? n : mx;
    }, 0);
    return String(max + 1);
  }

  private txns(
    dealId: number,
    p: {
      client: { id: number }; supplier: { id: number }; treasury: { id: number } | null;
      commissionParty: { id: number } | null; date: Date; no: string;
      sellTotal: number; buyTotal: number; chargesTotal: number; chargeNames: string[]; exchangeRate: number | null;
      paidIn: number; paidOut: number; nawlon: number;
      items: { freight: number; tea: number; commission: number; commissionPartyId: number | null; freightTreasuryId: number | null; freightNote: string | null; teaTreasuryId: number | null; teaNote: string | null }[];
      dto: CreateDealDto; createdById?: number;
    },
  ): Prisma.TransactionCreateManyInput[] {
    const { client, supplier, treasury, commissionParty, date, no, sellTotal, buyTotal, chargesTotal, chargeNames, exchangeRate, paidIn, paidOut, nawlon, items, dto, createdById } = p;
    // زي الفاتورة: العميل عليه رجلين بنشاطين — الأصناف (تجارة) وبنود الشحن (شحن).
    // رجل الأصناف بتتكتب دايماً إلا لو العملية بنود شحن بس، عشان العمليات القديمة
    // تفضل حركاتها زي ما هي بالظبط.
    const writeTrade = sellTotal !== 0 || chargesTotal === 0;
    const writeBuy = buyTotal !== 0 || chargesTotal === 0;
    // سعر الصرف على حركة المورد الدولاري — عشان متوسط سعر صرفه يتحسب صح.
    const usd = exchangeRate ? { exchangeRate } : {};
    const txns: Prisma.TransactionCreateManyInput[] = [];
    if (writeTrade) txns.push({ date, type: 'بيع خارجي', partyId: client.id, debit: sellTotal, note: `بيع خارجي #${no}`, dealId, activity: 'TRADE' });
    if (chargesTotal !== 0) txns.push({ date, type: INVOICE_CHARGES_TX_TYPE, partyId: client.id, debit: chargesTotal, note: `بنود شحن بيع خارجي #${no}${chargeNames.length ? ` (${chargeNames.join('، ')})` : ''}`, dealId, activity: 'SHIPPING' });
    if (writeBuy) txns.push({ date, type: 'شراء خارجي', partyId: supplier.id, credit: buyTotal, note: `شراء خارجي #${no}`, dealId, activity: 'TRADE', ...usd });
    if (paidIn > 0) txns.push({ date, type: 'تحصيل', partyId: client.id, treasuryId: treasury?.id ?? null, credit: paidIn, cashIn: paidIn, dealId });
    if (paidOut > 0) txns.push({ date, type: 'دفعة لمورد', partyId: supplier.id, treasuryId: treasury?.id ?? null, debit: paidOut, cashOut: paidOut, dealId });
    if (dto.commissionAmount && dto.commissionAmount > 0 && commissionParty) txns.push({ date, type: 'commission', partyId: commissionParty.id, credit: dto.commissionAmount, note: `commission صفقة #${no}`, dealId });
    if (nawlon > 0) txns.push({ date, type: 'ناولون', partyId: client.id, debit: nawlon, note: `ناولون صفقة #${no}`, dealId });
    // تكاليف بنود العملية — ناولون خارجي/شاي بيتدفعوا نقدًا من خزينة مختارة، وعمولة البند تترحّل لصاحبها.
    for (const it of items) {
      const fTr = it.freightTreasuryId ?? treasury?.id ?? null;
      if ((it.freight || 0) > 0 && fTr) txns.push({ date, type: 'ناولون خارجي', treasuryId: fTr, cashOut: it.freight, note: it.freightNote || `ناولون خارجي صفقة #${no}`, dealId });
      const tTr = it.teaTreasuryId ?? treasury?.id ?? null;
      if ((it.tea || 0) > 0 && tTr) txns.push({ date, type: 'شاي', treasuryId: tTr, cashOut: it.tea, note: it.teaNote || `شاي صفقة #${no}`, dealId });
      if ((it.commission || 0) > 0 && it.commissionPartyId) txns.push({ date, type: 'commission', partyId: it.commissionPartyId, credit: it.commission, note: `عمولة صفقة #${no}`, dealId });
    }
    // Attribute every generated movement to the user who created/edited the deal.
    return createdById ? txns.map((t) => ({ ...t, createdById })) : txns;
  }
}
