import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePriceListDto, PriceListItemDto, UpdatePriceListDto } from './dto/settlement.dto';

/** الإيداع عند المورد = توريد دولار له عن طريق وسيط صرف (شوف ForexRepository.usdOut). */
export const DEPOSIT_TX_TYPE = 'USD_OUT';

const PARTNER_INCLUDE = {
  suppliers: { include: { supplier: { select: { id: true, uid: true, name: true, currency: true } } } },
  user: { select: { uid: true, name: true, username: true } },
} as const;

const LIST_INCLUDE = {
  supplier: { select: { uid: true, name: true } },
  items: {
    include: { product: { select: { uid: true, name: true, unit: true } } },
    orderBy: { product: { name: 'asc' } },
  },
} as const;

@Injectable()
export class SettlementRepository {
  constructor(private prisma: PrismaService) {}

  // ------------------------------- الشركاء -------------------------------

  partners() {
    return this.prisma.partner.findMany({
      include: PARTNER_INCLUDE,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  partnersForUser(userId: number) {
    return this.prisma.partner.findMany({
      where: { userId },
      include: PARTNER_INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  async partnerByUid(uid: string) {
    const partner = await this.prisma.partner.findUnique({ where: { uid }, include: PARTNER_INCLUDE });
    if (!partner) throw new NotFoundException('هذا الاسم غير موجود في التصفية');
    return partner;
  }

  createPartner(data: Record<string, unknown>) {
    return this.prisma.partner.create({ data: data as any, include: PARTNER_INCLUDE });
  }

  updatePartner(id: number, data: Record<string, unknown>) {
    return this.prisma.partner.update({ where: { id }, data, include: PARTNER_INCLUDE });
  }

  deletePartner(id: number) {
    return this.prisma.partner.delete({ where: { id } });
  }

  async findPartyByUid(uid: string) {
    const party = await this.prisma.party.findUnique({
      where: { uid },
      select: { id: true, uid: true, name: true, currency: true },
    });
    if (!party) throw new NotFoundException('الطرف غير موجود');
    return party;
  }

  async findUserByUid(uid: string) {
    const user = await this.prisma.user.findUnique({ where: { uid }, select: { id: true, uid: true, name: true } });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  // --------------------------- قوايم الأسعار ---------------------------

  /** قوايم المورد من الأقدم للأحدث — الترتيب ده هو اللي الحسبة بتدوّر بيه. */
  priceLists(supplierIds: number[]) {
    return this.prisma.supplierPriceList.findMany({
      where: { supplierId: { in: supplierIds } },
      include: LIST_INCLUDE,
      orderBy: { weekStart: 'asc' },
    });
  }

  /**
   * أول قايمة لنفس المورد فترتها متقاطعة مع [start, end]. التقاطع = بدايتها
   * قبل نهايتنا أو فيها، ونهايتها بعد بدايتنا أو فيها.
   */
  overlappingList(supplierId: number, start: Date, end: Date, exceptUid?: string) {
    return this.prisma.supplierPriceList.findFirst({
      where: {
        supplierId,
        weekStart: { lte: end },
        weekEnd: { gte: start },
        ...(exceptUid ? { uid: { not: exceptUid } } : {}),
      },
      select: { uid: true, weekStart: true, weekEnd: true },
      orderBy: { weekStart: 'asc' },
    });
  }

  async priceListByUid(uid: string) {
    const list = await this.prisma.supplierPriceList.findUnique({ where: { uid }, include: LIST_INCLUDE });
    if (!list) throw new NotFoundException('قائمة الأسعار غير موجودة');
    return list;
  }

  /** uid الصنف -> id — بترفض أي uid مش موجود عشان ما يتسجّلش سطر ضايع. */
  async productIdsByUid(uids: string[]) {
    const products = await this.prisma.product.findMany({
      where: { uid: { in: uids } },
      select: { id: true, uid: true },
    });
    const map = new Map(products.map((p) => [p.uid, p.id]));
    if (uids.some((u) => !map.has(u))) throw new NotFoundException('صنف غير موجود في القائمة');
    return map;
  }

  async createPriceList(
    supplierId: number,
    weekStart: Date,
    weekEnd: Date,
    dto: CreatePriceListDto,
    items: PriceListItemDto[],
  ) {
    const map = await this.productIdsByUid(items.map((i) => i.productId));
    return this.prisma.supplierPriceList.create({
      data: {
        supplierId,
        weekStart,
        weekEnd,
        note: dto.note ?? null,
        items: { create: items.map((i) => ({ productId: map.get(i.productId)!, price: i.price })) },
      },
      include: LIST_INCLUDE,
    });
  }

  /**
   * تعديل قايمة: الأصناف المبعوتة بتـ upsert، والباقي يفضل زي ما هو. `remove`
   * بتشيل أصناف صريحة. مفيش استبدال كامل — كان بيضيف أسعار لأصناف مستبعدة.
   */
  async updatePriceList(uid: string, dto: UpdatePriceListDto, weekStart?: Date, weekEnd?: Date) {
    const list = await this.priceListByUid(uid);
    // سعر صفر ليس سعراً — لا يُسجل، مثل مسار الإنشاء
    const items = (dto.items ?? []).filter((i) => i.price > 0);
    const remove = dto.removeProductIds ?? [];
    const map = await this.productIdsByUid([...items.map((i) => i.productId), ...remove]);

    return this.prisma.$transaction(async (tx) => {
      for (const i of items) {
        const productId = map.get(i.productId)!;
        await tx.supplierPriceListItem.upsert({
          where: { priceListId_productId: { priceListId: list.id, productId } },
          update: { price: i.price },
          create: { priceListId: list.id, productId, price: i.price },
        });
      }
      if (remove.length) {
        await tx.supplierPriceListItem.deleteMany({
          where: { priceListId: list.id, productId: { in: remove.map((u) => map.get(u)!) } },
        });
      }
      return tx.supplierPriceList.update({
        where: { id: list.id },
        data: {
          ...(weekStart ? { weekStart } : {}),
          ...(weekEnd ? { weekEnd } : {}),
          ...(dto.note !== undefined ? { note: dto.note || null } : {}),
        },
        include: LIST_INCLUDE,
      });
    });
  }

  // --------------------------- أصناف المورد ---------------------------

  /**
   * كل سطر شراء حقيقي من المورد لصنف غير خدمي. بنجيب عملة الفاتورة وسعر صرفها
   * كمان: فاتورة المورد الدولاري بتبقى بالدولار، وقوايم الأسعار بالجنيه، فلازم
   * نحوّل قبل ما نعرض السعر كمقترح — ومنعرضوش خالص لو مفيش سعر صرف.
   */
  purchaseLines(supplierIds: number[]) {
    return this.prisma.invoiceItem.findMany({
      where: {
        invoice: { partyId: { in: supplierIds }, kind: 'PURCHASE', fake: false },
        product: { service: false },
      },
      select: {
        price: true,
        product: { select: { id: true, uid: true, name: true, unit: true, hidden: true } },
        invoice: { select: { date: true, currency: true, exchangeRate: true } },
      },
      orderBy: { invoice: { date: 'asc' } },
    });
  }

  // ----------------------- العربيات (فواتير البيع) -----------------------

  /**
   * فواتير البيع المرشّحة. `productIds = null` معناها الاسم مش مربوط بموردين،
   * فكل فواتير البيع مرشّحة. `partnerId` بترجّع المتعلّم عليها للاسم ده بس.
   */
  saleInvoices(productIds: number[] | null, partnerId?: number, onlySelected = false) {
    return this.prisma.invoice.findMany({
      where: {
        kind: 'SALE',
        fake: false,
        ...(productIds ? { items: { some: { productId: { in: productIds } } } } : {}),
        // الفلترة على المحدد فقط عند الطلب — أما الـ include فيقصر الصفوف على
        // هذا الشريك دائماً، وإلا قُرئت صفوف شركاء آخرين في شاشة الاختيار.
        ...(onlySelected && partnerId ? { partnerVehicles: { some: { partnerId } } } : {}),
      },
      include: {
        party: { select: { uid: true, name: true } },
        partnerVehicles: partnerId ? { where: { partnerId } } : false,
        itemWeeks: { include: { priceList: { select: { uid: true, weekStart: true } } } },
        manifests: {
          select: { uid: true, no: true, vehicleNo: true, trailerNo: true, vehicleLabel: true },
          orderBy: { id: 'asc' },
        },
        items: {
          include: { product: { select: { id: true, uid: true, name: true, unit: true, service: true } } },
          orderBy: { id: 'asc' },
        },
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
  }

  /** بترجّع ids فواتير البيع اللي فيها صنف من أصناف الاسم فعلاً (أو أي فاتورة لو مفيش موردين). */
  async sellableInvoiceIdsByUid(uids: string[], productIds: number[] | null) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        uid: { in: uids },
        kind: 'SALE',
        fake: false,
        ...(productIds ? { items: { some: { productId: { in: productIds } } } } : {}),
      },
      select: { id: true, uid: true },
    });
    const map = new Map(invoices.map((i) => [i.uid, i.id]));
    if (uids.some((u) => !map.has(u))) {
      throw new NotFoundException('فاتورة بيع غير موجودة، أو وهمية، أو لا تحتوي أصناف هذا الاسم');
    }
    return map;
  }


  async invoiceIdByUid(uid: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { uid }, select: { id: true } });
    if (!invoice) throw new NotFoundException('الفاتورة غير موجودة');
    return invoice.id;
  }

  /** بترجّع عدد اللي اتضاف فعلاً (المتعلّم عليه قبل كده مابيتعدّش). */
  async selectInvoices(partnerId: number, invoiceIds: number[]) {
    const { count } = await this.prisma.partnerVehicle.createMany({
      data: invoiceIds.map((invoiceId) => ({ partnerId, invoiceId })),
      skipDuplicates: true,
    });
    return count;
  }

  async unselectInvoice(partnerId: number, invoiceId: number) {
    await this.prisma.partnerVehicle.deleteMany({ where: { partnerId, invoiceId } });
    return { ok: true };
  }

  /**
   * فواتير الشراء المرشّحة للتصفية الثابتة. الفاتورة لازم تكون **من مورد الاسم
   * نفسه**، لا أي فاتورة فيها صنف من أصنافه: الصنف الواحد قد يُشترى من أكثر من
   * مورد، فبدون هذا القيد دخلت مشتريات مورد آخر في مستحقه.
   * والـ include يقصر صفوف `partnerVehicles` على هذا الاسم حتى لا تُقرأ صفوف
   * أسماء أخرى في شاشة الاختيار.
   */
  purchaseInvoices(
    productIds: number[] | null,
    supplierIds: number[],
    partnerId?: number,
    onlySelected = false,
  ) {
    return this.prisma.invoice.findMany({
      where: {
        kind: 'PURCHASE',
        fake: false,
        // قائمة فارغة = لا مورد محدد، فلا فاتورة تُطابق
        partyId: { in: supplierIds },
        ...(productIds ? { items: { some: { productId: { in: productIds } } } } : {}),
        ...(onlySelected && partnerId ? { partnerVehicles: { some: { partnerId } } } : {}),
      },
      include: {
        party: { select: { uid: true, name: true } },
        partnerVehicles: partnerId ? { where: { partnerId } } : false,
        items: {
          include: { product: { select: { id: true, uid: true, name: true, unit: true, service: true } } },
          orderBy: { id: 'asc' },
        },
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
  }

  /**
   * ids فواتير الشراء المسموح اختيارها: من مورد الاسم، وفيها صنف من أصنافه.
   * القيد هنا ضروري ولو كانت الشاشة تعرض المسموح فقط، لأن الـ API مدخل مستقل.
   */
  async purchasableInvoiceIdsByUid(
    uids: string[],
    productIds: number[] | null,
    supplierIds: number[],
  ) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        uid: { in: uids },
        kind: 'PURCHASE',
        fake: false,
        partyId: { in: supplierIds },
        ...(productIds ? { items: { some: { productId: { in: productIds } } } } : {}),
      },
      select: { id: true, uid: true },
    });
    const map = new Map(invoices.map((i) => [i.uid, i.id]));
    if (uids.some((u) => !map.has(u))) {
      throw new NotFoundException(
        'فاتورة شراء غير موجودة، أو وهمية، أو ليست من مورد هذا الاسم، أو لا تحتوي أصنافه',
      );
    }
    return map;
  }

  async updateVehicle(
    partnerId: number,
    invoiceId: number,
    data: { cartons?: number | null; rate?: number | null; note?: string | null },
  ) {
    const existing = await this.prisma.partnerVehicle.findUnique({
      where: { partnerId_invoiceId: { partnerId, invoiceId } },
    });
    if (!existing) throw new NotFoundException('هذه العربية غير محددة في التصفية');
    return this.prisma.partnerVehicle.update({
      where: { partnerId_invoiceId: { partnerId, invoiceId } },
      data,
    });
  }

  // ------------------- أسبوع مفروض على (فاتورة، صنف) -------------------

  async setItemWeek(invoiceId: number, productId: number, priceListId: number | null) {
    if (priceListId === null) {
      await this.prisma.invoiceItemWeek.deleteMany({ where: { invoiceId, productId } });
      return { ok: true };
    }
    await this.prisma.invoiceItemWeek.upsert({
      where: { invoiceId_productId: { invoiceId, productId } },
      update: { priceListId },
      create: { invoiceId, productId, priceListId },
    });
    return { ok: true };
  }

  // ------------------------ حساب المورد والإيداعات ------------------------

  // -------------------------- حركات رأس المال --------------------------

  capitalMovements(partnerId: number) {
    return this.prisma.partnerCapitalMovement.findMany({
      where: { partnerId },
      include: { createdBy: { select: { uid: true, name: true } } },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
  }

  async capitalMovementByUid(partnerId: number, uid: string) {
    const row = await this.prisma.partnerCapitalMovement.findUnique({ where: { uid } });
    if (!row || row.partnerId !== partnerId) {
      throw new NotFoundException('حركة رأس المال غير موجودة لهذا الاسم');
    }
    return row;
  }

  createCapitalMovement(data: {
    partnerId: number; date: Date; amount: number;
    note: string | null; createdById: number | null;
  }) {
    return this.prisma.partnerCapitalMovement.create({ data });
  }

  deleteCapitalMovement(id: number) {
    return this.prisma.partnerCapitalMovement.delete({ where: { id } });
  }

  // ------------------------------- الدفعات -------------------------------

  payments(partnerId: number) {
    return this.prisma.partnerPayment.findMany({
      where: { partnerId },
      include: { createdBy: { select: { uid: true, name: true } } },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
  }

  async paymentByUid(partnerId: number, uid: string) {
    const row = await this.prisma.partnerPayment.findUnique({ where: { uid } });
    if (!row || row.partnerId !== partnerId) {
      throw new NotFoundException('الدفعة غير موجودة لهذا الاسم');
    }
    return row;
  }

  createPayment(data: {
    partnerId: number; date: Date; amount: number;
    note: string | null; createdById: number | null;
  }) {
    return this.prisma.partnerPayment.create({ data });
  }

  deletePayment(id: number) {
    return this.prisma.partnerPayment.delete({ where: { id } });
  }

  // ------------------------ حساب المورد والإيداعات ------------------------

  /** الإيداعات عند المورد — تُسجل من تاب الدولار عن طريق الوسيط، وهنا للقراءة فقط. */
  deposits(supplierId: number) {
    return this.prisma.dollarAgentTx.findMany({
      where: { partyId: supplierId, type: DEPOSIT_TX_TYPE },
      include: { agent: { select: { uid: true, name: true } } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
  }

  /** فواتير شراء المورد — دي اللي بتتخصم من رصيد الإيداعات. */
  supplierInvoices(supplierId: number) {
    return this.prisma.invoice.findMany({
      where: { partyId: supplierId, kind: 'PURCHASE', fake: false },
      select: {
        uid: true, no: true, date: true, discount: true, currency: true, exchangeRate: true,
        items: { select: { qty: true, price: true } },
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
  }
}
