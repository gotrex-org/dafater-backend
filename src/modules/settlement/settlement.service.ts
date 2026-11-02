import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BalancesService } from '../balances/balances.service';
import { SettlementRepository } from './settlement.repository';
import { SettlementItemsRepository, normalizeAr } from './settlement-items.repository';
import {
  CreatePartnerDto, CreatePriceListDto, PartnerUpsertDto, SelectInvoicesDto,
  SetItemWeekDto, UpdatePartnerVehicleDto, UpdatePriceListDto,
  CapitalMovementDto, FixedRateDto, SelectItemsDto,
} from './dto/settlement.dto';

/**
 * تقريب لقرشين. `Math.round` يقرّب السالب لأعلى (‎-0.005 → ‎-0‎)، فالخسارة كانت
 * تُقرَّب لصالح الاسم بنصف قرش — نقرّب القيمة المطلقة ثم نعيد الإشارة.
 */
const r2 = (n: number) => (n < 0 ? -Math.round(-n * 100) / 100 : Math.round(n * 100) / 100);
const day = (d: Date) => d.toISOString().slice(0, 10);
/** منتصف ليل UTC لهذا اليوم — كل أعمدة التواريخ في النظام مخزّنة كذلك. */
const utcDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);

/** مَن يطلب — المدير يرى كل التصفيات، وغيره يرى المرتبطة بحسابه فقط. */
export interface Requester {
  intId: number;
  admin: boolean;
}

/** قائمة أسعار فترة، جاهزة للبحث بالصنف. */
interface WeekPrices {
  uid: string;
  supplierId: number;
  weekStart: Date;
  weekEnd: Date;
  prices: Map<number, number>;
}

/** سطر صنف في عربية. `null` في سعر الشراء = لا يوجد سعر معروف للصنف. */
export interface VehicleLine {
  id: string;
  productId: string;
  productName: string;
  unit: string | null;
  qty: number;
  salePrice: number | null;
  purchasePrice: number | null;
  capital: number | null;
  profit: number | null;
  weekId: string | null;
  weekStart: string | null;
  weekEnd: string | null;
  weekForced: boolean;
}

type PartnerRow = Awaited<ReturnType<SettlementRepository['partnerByUid']>>;
type CapitalMovementRow = Awaited<ReturnType<SettlementRepository['capitalMovements']>>[number];

@Injectable()
export class SettlementService {
  constructor(
    private repo: SettlementRepository,
    private items: SettlementItemsRepository,
    private balances: BalancesService,
  ) {}

  // ------------------------------- الأسماء -------------------------------

  private present(p: PartnerRow) {
    return {
      id: p.uid,
      name: p.name,
      shareBasis: p.shareBasis,
      capital: p.capital,
      cartonExpense: p.cartonExpense,
      active: p.active,
      note: p.note,
      suppliers: p.suppliers.map((s) => ({
        id: s.supplier.uid,
        name: s.supplier.name,
        currency: s.supplier.currency,
      })),
      user: p.user ? { id: p.user.uid, name: p.user.name, username: p.user.username } : null,
    };
  }

  /** الأسماء اللي الطالب مسموح له يشوفها. */
  async partners(me: Requester) {
    const rows = me.admin ? await this.repo.partners() : await this.repo.partnersForUser(me.intId);
    return rows.map((p) => this.present(p));
  }

  /**
   * تصفية الاسم ده، بعد التأكد إن الطالب من حقه يشوفها. غير الأدمن مربوط
   * بحسابه بس — عشان اسم ما يشوفش تصفية اسم تاني من الـ selector.
   */
  private async access(partnerUid: string, me: Requester) {
    const partner = await this.repo.partnerByUid(partnerUid);
    if (!me.admin && partner.userId !== me.intId) {
      throw new ForbiddenException('هذه التصفية ليست خاصة بحسابك');
    }
    return partner;
  }

  /** ids الموردين المرتبطين بالشريك. فارغة = لا يوجد مورد، فلا أصناف تُحسب. */
  private supplierIds(partner: PartnerRow) {
    return partner.suppliers.map((s) => s.supplierId);
  }

  /** قوائم الأسعار تفيد فقط عند وجود مورد محدد. */
  private usesPriceLists(partner: PartnerRow) {
    return partner.suppliers.length > 0;
  }

  private requireSuppliersForLists(partner: PartnerRow) {
    const ids = this.supplierIds(partner);
    if (!ids.length) {
      throw new BadRequestException(
        `لا يوجد مورد محدد لـ «${partner.name}»، لذلك لا توجد قوائم أسعار. حدد المورد من إعدادات التصفية.`,
      );
    }
    return ids;
  }

  async createPartner(dto: CreatePartnerDto) {
    const { data, supplierIds } = await this.partnerData(dto);
    // على الإنشاء لا يوجد ما يُحذف، فـ `create` وحدها
    if (supplierIds) data.suppliers = { create: supplierIds.map((supplierId) => ({ supplierId })) };
    const partner = await this.repo.createPartner({ ...data, name: dto.name.trim() });
    return this.present(partner);
  }

  async updatePartner(uid: string, dto: PartnerUpsertDto) {
    const partner = await this.repo.partnerByUid(uid);
    const { data, supplierIds } = await this.partnerData(dto);
    if (dto.name !== undefined) data.name = dto.name.trim();
    // استبدال كامل لمجموعة الموردين — قائمة اختيار، لا سجل تاريخي
    if (supplierIds) {
      data.suppliers = {
        deleteMany: {},
        create: supplierIds.map((supplierId) => ({ supplierId })),
      };
    }
    const updated = await this.repo.updatePartner(partner.id, data);
    return this.present(updated);
  }

  private async partnerData(dto: PartnerUpsertDto) {
    const data: Record<string, unknown> = {};
    if (dto.shareBasis !== undefined) data.shareBasis = dto.shareBasis;
    if (dto.capital !== undefined) data.capital = dto.capital;
    if (dto.cartonExpense !== undefined) data.cartonExpense = dto.cartonExpense;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.note !== undefined) data.note = dto.note || null;
    if (dto.userId !== undefined) {
      data.userId = dto.userId ? (await this.repo.findUserByUid(dto.userId)).id : null;
    }
    let supplierIds: number[] | undefined;
    if (dto.supplierIds !== undefined) {
      const ids = await Promise.all(
        (dto.supplierIds ?? []).map(async (u) => (await this.repo.findPartyByUid(u)).id),
      );
      supplierIds = [...new Set(ids)];
    }
    return { data, supplierIds };
  }

  async deletePartner(uid: string) {
    const partner = await this.repo.partnerByUid(uid);
    await this.repo.deletePartner(partner.id);
    return { ok: true };
  }

  // ---------------------------- قوايم الأسعار ----------------------------

  private async weeks(supplierIds: number[]): Promise<WeekPrices[]> {
    if (!supplierIds.length) return [];
    const lists = await this.repo.priceLists(supplierIds);
    return lists.map((l) => ({
      uid: l.uid,
      supplierId: l.supplierId,
      weekStart: l.weekStart,
      weekEnd: l.weekEnd,
      prices: new Map(l.items.map((i) => [i.productId, i.price])),
    }));
  }

  /**
   * القايمة اللي تاريخ الفاتورة واقع في فترتها وفيها سعر للصنف ده. الفترات
   * مابتتعارضش لنفس المورد، لكن اسم مربوط بأكتر من مورد ممكن يلاقي أكتر من
   * قايمة — فبناخد أحدث بداية، وده ثابت ومتوقّع.
   */
  private weekFor(weeks: WeekPrices[], date: Date, productId: number): WeekPrices | null {
    const t = date.getTime();
    let found: WeekPrices | null = null;
    for (const w of weeks) {
      if (w.weekStart.getTime() > t || t > w.weekEnd.getTime()) continue;
      if (!w.prices.has(productId)) continue;
      if (!found || w.weekStart.getTime() > found.weekStart.getTime()) found = w;
    }
    return found;
  }

  /** أي قايمة فترتها شايلة التاريخ — للتنبيه «الصنف مش متسعّر في الفترة دي». */
  private periodFor(weeks: WeekPrices[], date: Date): WeekPrices | null {
    const t = date.getTime();
    return weeks.find((w) => w.weekStart.getTime() <= t && t <= w.weekEnd.getTime()) ?? null;
  }

  async priceLists(partnerUid: string, me: Requester) {
    const partner = await this.access(partnerUid, me);
    // القراءة محمية مثل الكتابة: صاحب تصفية ثابتة لا شأن له بقوائم الأسعار،
    // والواجهة تخفيها عنه فلا يصح أن يقرأها من الـ API
    this.assertListScope(partner, me);
    const ids = this.supplierIds(partner);
    if (!ids.length) return [];
    const lists = await this.repo.priceLists(ids);
    // «الأحدث» بتتحسب لكل مورد لوحده — دي اللي غير الأدمن مسموح له يعدّلها
    const latestBySupplier = new Map<number, string>();
    for (const l of lists) latestBySupplier.set(l.supplierId, l.uid);
    return lists
      .map((l) => ({
        id: l.uid,
        supplier: { id: l.supplier.uid, name: l.supplier.name },
        weekStart: day(l.weekStart),
        weekEnd: day(l.weekEnd),
        note: l.note,
        itemCount: l.items.length,
        latest: latestBySupplier.get(l.supplierId) === l.uid,
        items: l.items.map((i) => ({
          id: i.uid,
          productId: i.product.uid,
          productName: i.product.name,
          unit: i.product.unit,
          price: i.price,
        })),
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      }))
      .reverse(); // الأحدث فوق في العرض
  }

  /**
   * الفترة لازم تكون سليمة ومابتتعارضش مع قايمة تانية لنفس المورد — لأن فترتين
   * متداخلتين معناها إن تاريخ فاتورة واحد له سعرين، والحسبة تبقى عشوائية.
   */
  private async assertPeriodFree(supplierId: number, start: Date, end: Date, exceptUid?: string) {
    if (end.getTime() < start.getTime()) {
      throw new BadRequestException('تاريخ النهاية يجب أن يكون بعد تاريخ البداية أو مساوياً له');
    }
    const clash = await this.repo.overlappingList(supplierId, start, end, exceptUid);
    if (clash) {
      throw new BadRequestException(
        `هذه الفترة متداخلة مع قائمة من ${day(clash.weekStart)} إلى ${day(clash.weekEnd)}. عدّلها بدلاً من إضافة قائمة جديدة`,
      );
    }
  }

  /** المورد اللي القايمة الجديدة بتتسجّل عليه: المبعوت، وإلا الوحيد المربوط بالاسم. */
  private async resolveListSupplier(partner: PartnerRow, supplierUid?: string) {
    const ids = this.requireSuppliersForLists(partner);
    if (supplierUid) {
      const party = await this.repo.findPartyByUid(supplierUid);
      if (!ids.includes(party.id)) {
        throw new BadRequestException(`«${party.name}» ليس من موردي «${partner.name}»`);
      }
      return party.id;
    }
    if (ids.length > 1) throw new BadRequestException('حدد المورد، فهذا الاسم مرتبط بأكثر من مورد');
    return ids[0];
  }

  /**
   * قوائم الأسعار تُستخدم في التصفية برأس المال فقط، لأنها مصدر سعر الشراء.
   * صاحب تصفية ثابتة لا يكتب فيها وإن مُنح الصلاحية بالخطأ.
   */
  private assertListScope(partner: PartnerRow, me: Requester) {
    if (!me.admin && partner.shareBasis === 'FIXED') {
      throw new ForbiddenException('طريقة حسابك تصفية ثابتة، فلا تُستخدم قوائم الأسعار');
    }
  }

  async createPriceList(partnerUid: string, dto: CreatePriceListDto, me: Requester) {
    const partner = await this.access(partnerUid, me);
    this.assertListScope(partner, me);
    const supplierId = await this.resolveListSupplier(partner, dto.supplierId);
    // أسطر بسعر صفر ما بتتسجّلش — الصنف اللي مالوش سعر الفترة دي يفضل بره القايمة.
    const items = dto.items.filter((i) => i.price > 0);
    if (!items.length) throw new BadRequestException('أضف سعراً لصنف واحد على الأقل');
    if (items.length !== new Set(items.map((i) => i.productId)).size) {
      throw new BadRequestException('يوجد صنف مكرر في القائمة');
    }
    const weekStart = utcDay(dto.weekStart);
    const weekEnd = utcDay(dto.weekEnd);
    if (!me.admin) {
      // غير المدير لا يضيف فترة سابقة: الحسابات القديمة تقرأ منها، ومَن
      // يُحسب نصيبه من هذه الأرقام لا يعيد تسعير الماضي.
      const lists = await this.repo.priceLists([supplierId]);
      const latest = lists[lists.length - 1];
      if (latest && weekStart.getTime() <= latest.weekEnd.getTime()) {
        throw new ForbiddenException(
          'إضافة فترة سابقة للمدير فقط، لأن الحسابات السابقة تقرأ منها',
        );
      }
    }
    await this.assertPeriodFree(supplierId, weekStart, weekEnd);
    const list = await this.repo.createPriceList(supplierId, weekStart, weekEnd, dto, items);
    return {
      id: list.uid,
      weekStart: day(list.weekStart),
      weekEnd: day(list.weekEnd),
      itemCount: list.items.length,
    };
  }

  /**
   * تعديل قايمة. غير الأدمن (صاحب الاسم نفسه) مسموح له بأحدث قايمة بس ومش
   * مسموح له ينقل تواريخها: اللي نصيبه بيتحسب من الأرقام دي مايقدرش يرجع
   * يغيّر فترات قديمة الحسابات اتبنت عليها.
   */
  async updatePriceList(partnerUid: string, uid: string, dto: UpdatePriceListDto, me: Requester) {
    const partner = await this.access(partnerUid, me);
    this.assertListScope(partner, me);
    const ids = this.requireSuppliersForLists(partner);
    const lists = await this.repo.priceLists(ids);
    const target = lists.find((l) => l.uid === uid);
    if (!target) throw new NotFoundException('قائمة الأسعار غير موجودة لموردي هذا الاسم');

    if (!me.admin) {
      const latest = lists.filter((l) => l.supplierId === target.supplierId).pop();
      if (latest?.uid !== uid) {
        throw new ForbiddenException('تعديل القوائم السابقة للمالك فقط، لأن الحسابات القديمة تقرأ منها');
      }
      const movesStart = dto.weekStart && day(target.weekStart) !== dto.weekStart;
      const movesEnd = dto.weekEnd && day(target.weekEnd) !== dto.weekEnd;
      if (movesStart || movesEnd) {
        throw new ForbiddenException('تغيير تواريخ الفترة للمالك فقط');
      }
    }

    if (dto.items?.length && dto.items.length !== new Set(dto.items.map((i) => i.productId)).size) {
      throw new BadRequestException('يوجد صنف مكرر في القائمة');
    }
    const weekStart = dto.weekStart ? utcDay(dto.weekStart) : undefined;
    const weekEnd = dto.weekEnd ? utcDay(dto.weekEnd) : undefined;
    if (weekStart || weekEnd) {
      await this.assertPeriodFree(
        target.supplierId,
        weekStart ?? target.weekStart,
        weekEnd ?? target.weekEnd,
        uid,
      );
    }
    const list = await this.repo.updatePriceList(uid, dto, weekStart, weekEnd);
    return {
      id: list.uid,
      weekStart: day(list.weekStart),
      weekEnd: day(list.weekEnd),
      itemCount: list.items.length,
    };
  }

  /**
   * الأصناف التي تُحسب للشريك: أصناف المورد المحدد فقط، مستخرجة من فواتير
   * الشراء منه. بدون مورد لا توجد أصناف، فلا شيء يُحسب.
   */
  private async scopeProducts(partner: PartnerRow, onlySupplierId?: number) {
    const all = this.supplierIds(partner);
    const ids = onlySupplierId ? all.filter((i) => i === onlySupplierId) : all;
    if (!ids.length) return { ids: [] as number[], rows: [] };
    const lines = await this.repo.purchaseLines(ids);
    // فاتورة شراء دولار: سعرها بالجنيه من دورة الدولار (FIFO على دفعات الوكيل)، وغير
    // المسعّرة بالكامل بعد بدون سعر.
    const fifo = lines.some((l) => l.invoice.currency === 'USD') ? await this.balances.usdFifo() : null;
    const usdRate = (invoiceId: number) => {
      const f = fifo?.byInvoice.get(invoiceId);
      return f && f.unpricedUsd <= 1e-9 && f.rate > 0 ? f.rate : 0;
    };
    return {
      ids: [...new Set(lines.map((l) => l.product.id))],
      rows: lines.map((l) => ({
        product: l.product,
        price: l.price,
        currency: l.invoice.currency,
        rate: l.invoice.currency === 'USD' ? usdRate(l.invoice.id) : (l.invoice.exchangeRate ?? 0),
      })),
    };
  }

  /**
   * أصناف المورد مع سعر مقترح بالجنيه: سعر أحدث قائمة، وإلا آخر سعر شراء بعد
   * تحويله بسعر صرف فاتورته. مورد دولاري بدون سعر صرف يُرجع `null`، لأن وضع
   * رقم بالدولار في خانة جنيه أسوأ من تركها فارغة.
   */
  async products(partnerUid: string, me: Requester, supplierUid?: string) {
    const partner = await this.access(partnerUid, me);
    // أسعار شراء المورد تظهر هنا، وهي من قوائم الأسعار — نفس حدود القراءة
    this.assertListScope(partner, me);
    let only: number | undefined;
    if (supplierUid) {
      only = (await this.repo.findPartyByUid(supplierUid)).id;
      // المورد المطلوب لازم يكون من موردي الشريك، وإلا كان الـ endpoint
      // بيكشف قوائم أسعار أي مورد في النظام لصاحب أي تصفية.
      if (!this.supplierIds(partner).includes(only)) {
        throw new BadRequestException('هذا المورد ليس من موردي هذا الشريك');
      }
    }
    const [{ rows }, weeks] = await Promise.all([
      this.scopeProducts(partner, only),
      this.weeks(only ? [only] : this.supplierIds(partner)),
    ]);
    const lastList = new Map<number, number>();
    for (const w of weeks) for (const [pid, price] of w.prices) lastList.set(pid, price);

    const byId = new Map<number, {
      id: string; name: string; unit: string | null; hidden: boolean;
      lastPurchasePrice: number | null; lastPurchaseCurrency: string;
      lastListPrice: number | null;
    }>();
    for (const row of rows) {
      const usd = row.currency === 'USD';
      byId.set(row.product.id, {
        id: row.product.uid,
        name: row.product.name,
        unit: row.product.unit,
        hidden: row.product.hidden,
        lastPurchasePrice: row.price > 0
          ? (usd ? (row.rate > 0 ? r2(row.price * row.rate) : null) : row.price)
          : null,
        lastPurchaseCurrency: row.currency,
        lastListPrice: lastList.get(row.product.id) ?? null,
      });
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }

  // ------------------------------- العربيات -------------------------------

  /**
   * حساب عربية واحدة لشريك طريقته «برأس المال»:
   *   رأس مال الأصناف = Σ (الكمية × سعر الشراء من قائمة أسعار فترتها)
   *   صافي الربح      = إجمالي البيع − إجمالي الشراء − مصروف التشغيل
   *   النسبة          = رأس ماله ÷ رأس مال الأصناف × 100، بحد أقصى 100%
   *   النصيب          = صافي الربح × النسبة (مكسب أو خسارة)
   * الأصناف خارج أصناف المورد والبنود الخدمية يتم تجاهلها، والصنف بدون سعر
   * معروف يُستبعد ولا يُحسب بصفر.
   */
  private computeVehicle(
    invoice: Awaited<ReturnType<SettlementRepository['saleInvoices']>>[number],
    weeks: WeekPrices[],
    scopeIds: Set<number>,
    partner: PartnerRow,
    moves: CapitalMovementRow[],
  ) {
    const warnings: string[] = [];

    // فاتورة بالدولار: أسعار البيع تُحوَّل للجنيه بسعر صرف الفاتورة. وبدون سعر
    // صرف لا نُقدّر: الربح والنصيب يرجعان null ويُستبعدان من الإجماليات.
    const usdNoRate = invoice.currency === 'USD' && !(invoice.exchangeRate && invoice.exchangeRate > 0);
    const rate = invoice.currency === 'USD' ? (invoice.exchangeRate || 0) : 1;
    if (usdNoRate) warnings.push('فاتورة بالدولار بدون سعر صرف. الربح والنصيب غير محسوبين');

    const forced = new Map(invoice.itemWeeks.map((w) => [w.productId, w.priceList]));
    const period = this.periodFor(weeks, invoice.date);

    const lines: VehicleLine[] = [];
    let capital = 0;
    let grossProfit = 0;
    let salesValue = 0;
    let cartons = 0;
    let unpriced = 0;

    for (const item of invoice.items) {
      if (item.product.service) continue;                     // بنود خدمية خارج الحساب
      if (!scopeIds.has(item.product.id)) continue;           // صنف ليس من أصناف المورد

      const forcedList = forced.get(item.product.id);
      const week = forcedList
        ? weeks.find((w) => w.uid === forcedList.uid) ?? null
        : this.weekFor(weeks, invoice.date, item.product.id);
      // سعر صفر ليس سعراً معروفاً — يُعامل مثل غير المسعّر
      const listed = week?.prices.get(item.product.id);
      const purchasePrice = listed && listed > 0 ? listed : null;

      const salePrice = usdNoRate ? null : item.price * rate;
      if (salePrice !== null) salesValue += salePrice * item.qty;

      if (purchasePrice === null) {
        unpriced += 1;
        warnings.push(
          period
            ? `${item.product.name}: لا يوجد سعر في قائمة ${day(period.weekStart)} → ${day(period.weekEnd)}`
            : `${item.product.name}: لا توجد قائمة أسعار لتاريخ الفاتورة`,
        );
      } else {
        capital += item.qty * purchasePrice;
        if (salePrice !== null) grossProfit += (salePrice - purchasePrice) * item.qty;
        // الكراتين تُعد على الأصناف المسعّرة فقط، وإلا خُصم مصروف التشغيل على
        // بضاعة ربحها مستبعد فظهرت خسارة غير حقيقية.
        cartons += item.qty;
      }

      lines.push({
        id: item.uid,
        productId: item.product.uid,
        productName: item.product.name,
        unit: item.product.unit,
        qty: item.qty,
        salePrice: salePrice === null ? null : r2(salePrice),
        purchasePrice: purchasePrice === null ? null : r2(purchasePrice),
        capital: purchasePrice === null ? null : r2(item.qty * purchasePrice),
        profit: purchasePrice === null || salePrice === null
          ? null
          : r2((salePrice - purchasePrice) * item.qty),
        weekId: week?.uid ?? null,
        weekStart: week ? day(week.weekStart) : null,
        weekEnd: week ? day(week.weekEnd) : null,
        weekForced: forced.has(item.product.id),
      });
    }

    const vehicleRow = invoice.partnerVehicles[0];
    const cartonsOverridden = vehicleRow?.cartons != null;
    const effectiveCartons = cartonsOverridden ? vehicleRow!.cartons! : cartons;
    const opExpense = effectiveCartons * partner.cartonExpense;
    const profit = usdNoRate ? null : grossProfit - opExpense;

    // رأس ماله وقت الفاتورة، لا رأس ماله اليوم: الإضافة أو النقص بعد تاريخ
    // الفاتورة لا يعيد حساب نصيبه فيها
    const ownCapital = this.capitalAt(partner, invoice.date, moves);

    // صنف واحد بدون سعر يوقف حساب الفاتورة كلها حتى يُسعَّر. حساب النسبة على
    // رأس المال الباقي كان يرفعها رفعاً غير حقيقي: رأس ماله 60,000 وفاتورة
    // رأس مالها 120,000 فيها صنف بـ 70,000 بدون سعر → 100% بدل 50%.
    const needsPricing = unpriced > 0;
    const percent = capital > 0 && !needsPricing
      ? Math.min(100, (ownCapital / capital) * 100)
      : 0;
    const share = profit === null || needsPricing ? null : (profit * percent) / 100;

    if (needsPricing) {
      warnings.push(
        `${unpriced} صنف بدون سعر في هذه الفاتورة. الفاتورة كلها غير محسوبة حتى تُسعَّر أصنافها`,
      );
    } else if (capital === 0 && lines.length) {
      warnings.push('لا يوجد صنف مسعّر في هذه الفاتورة، فالنصيب غير محسوب');
    }

    const plates = invoice.manifests
      .map((m) => [m.vehicleNo, m.trailerNo].filter(Boolean).join(' / '))
      .filter(Boolean);

    return {
      id: invoice.uid,
      /** داخلة في التصفية؟ — بيستخدمها جدول اختيار الفواتير */
      selected: invoice.partnerVehicles.length > 0,
      invoiceNo: invoice.no,
      date: invoice.date,
      hidden: invoice.hidden,
      clientName: invoice.party?.name ?? '',
      currency: invoice.currency,
      exchangeRate: invoice.exchangeRate,
      needsRate: usdNoRate,
      // تاريخ الفاتورة خارج كل فترات قوائم الأسعار — تنبيه أحمر، وبدون حساب بصفر
      noPricePeriod: !period && lines.length > 0,
      // رقم العربية (رأس + مقطورة) من كشف العربية المربوط بالفاتورة
      vehicleNo: plates.join(' + ') || null,
      vehicleLabel: invoice.manifests.map((m) => m.vehicleLabel).find(Boolean) ?? null,
      manifestNo: invoice.manifests.map((m) => m.no).join(' + ') || null,
      capital: r2(capital),
      salesValue: usdNoRate ? null : r2(salesValue),
      cartons: r2(effectiveCartons),
      cartonsOverridden,
      opExpense: r2(opExpense),
      /** رأس ماله في تاريخ هذه الفاتورة — بسط معادلة النسبة */
      ownCapital: r2(ownCapital),
      percent: r2(percent),
      grossProfit: usdNoRate ? null : r2(grossProfit),
      profit: profit === null ? null : r2(profit),
      share: share === null ? null : r2(share),
      /** النصيب محسوب على إيه — بيظهر في التفاصيل */
      // خام (مش مقرّب) — الإجماليات بتجمع عليه وتقرّب مرة واحدة في الآخر
      rawProfit: profit,
      rawShare: share,
      rawCapital: capital,
      rawSales: usdNoRate ? null : salesValue,
      note: vehicleRow?.note ?? null,
      itemCount: lines.length,
      unpricedCount: unpriced,
      /** فيها صنف بدون سعر، فكلها غير محسوبة وخارج الإجماليات */
      needsPricing,
      warnings,
      lines,
    };
  }

  /**
   * عربيات الشريك (طريقة رأس المال). `onlySelected` تقصر النتيجة على المحدد له،
   * وفي كل الحالات صفوف `partnerVehicles` المرفقة تخص هذا الشريك وحده حتى لا
   * يُقرأ تعديل كراتين شريك آخر أو تظهر فاتورته كأنها محددة هنا.
   */
  private async vehicles(partner: PartnerRow, onlySelected: boolean) {
    const { ids: scopeIds } = await this.scopeProducts(partner);
    if (!scopeIds.length) return [];
    const [weeks, invoices, moves] = await Promise.all([
      this.weeks(this.supplierIds(partner)),
      this.repo.saleInvoices(scopeIds, partner.id, onlySelected),
      this.repo.capitalMovements(partner.id),
    ]);
    const scopeSet = new Set(scopeIds);
    return invoices.map((inv) => this.computeVehicle(inv, weeks, scopeSet, partner, moves));
  }

  /**
   * رأس المال كما كان في تاريخ معين = الافتتاحي + الحركات حتى ذلك التاريخ.
   * الحركة اللاحقة لا ترفع نسبته في فاتورة سابقة لها.
   */
  private capitalAt(partner: PartnerRow, date: Date, moves: CapitalMovementRow[]) {
    const t = date.getTime();
    return moves.reduce(
      (sum, m) => (m.date.getTime() <= t ? sum + m.amount : sum),
      partner.capital,
    );
  }

  /**
   * شاشة التصفية. المحتوى يتبع طريقة التصفية: «برأس المال» تعرض الفواتير
   * الكاملة وإجمالياتها، و«تصفية ثابتة» تعرض فواتير الشراء ومستحق كل واحدة.
   */
  async overview(partnerUid: string, me: Requester) {
    const partner = await this.access(partnerUid, me);
    // حساب المورد (إيداعات ورصيد) للمدير فقط — الشريك يرى تصفيته لا حساب المورد
    const supplierAccount = me.admin ? await this.supplierAccount(partner) : null;

    if (partner.shareBasis === 'FIXED') {
      const list = await this.fixedItems(partner);
      return {
        partner: this.present(partner),
        totals: null,
        fixedTotals: {
          due: r2(list.reduce((s, v) => s + v.rawAmount, 0)),
          // الكمية المحسوبة فقط، حتى لا تظهر بطاقة كميات لا يقابلها مستحق
          qty: r2(list.reduce((s, v) => s + (v.amount == null ? 0 : v.qty), 0)),
          items: list.filter((v) => v.approved).length,
          // موافق عليها ولم يُحسب مستحقها (بدون مبلغ، أو نسبة على فاتورة دولار غير مسعّرة)
          needsAmount: list.filter((v) => v.approved && v.amount == null).length,
          // أضافها صاحب الاسم وتنتظر موافقة المالك
          pending: list.filter((v) => !v.approved).length,
        },
        supplierAccount,
        fixed: list.map(({ rawAmount, ...rest }) => rest),
        vehicles: [],
      };
    }

    const [list, moves] = await Promise.all([
      this.vehicles(partner, true),
      this.repo.capitalMovements(partner.id),
    ]);
    // نجمع الخام ونقرّب مرة واحدة، حتى لا يختلف مجموع الصفوف عن الإجمالي بقروش
    const counted = list.filter((v) => v.rawShare !== null);
    const totals = {
      // رأس المال الحالي (الافتتاحي + الإضافات − النقص)، وهو ما تعرضه البطاقة
      partnerCapital: r2(partner.capital + moves.reduce((s, m) => s + m.amount, 0)),
      openingCapital: partner.capital,
      share: r2(counted.reduce((s, v) => s + (v.rawShare ?? 0), 0)),
      profit: r2(counted.reduce((s, v) => s + (v.rawProfit ?? 0), 0)),
      capital: r2(list.reduce((s, v) => s + v.rawCapital, 0)),
      sales: r2(list.reduce((s, v) => s + (v.rawSales ?? 0), 0)),
      vehicles: list.length,
      /** فواتير بالدولار تحتاج سعر صرف قبل حسابها */
      needsRate: list.filter((v) => v.needsRate).length,
      /** فواتير فيها صنف بدون سعر — كلها خارج الإجماليات حتى تُسعَّر */
      needsPricing: list.filter((v) => v.needsPricing).length,
    };
    return {
      partner: this.present(partner),
      totals,
      fixedTotals: null,
      fixed: null,
      supplierAccount,
      // الجدول لا يحتاج تفاصيل الأصناف — تُجلب بالضغط على العربية
      vehicles: list.map(({ lines, rawProfit, rawShare, rawCapital, rawSales, ...rest }) => rest),
    };
  }

  // ------------------ التصفية الثابتة (أصناف من فواتير الشراء) ------------------

  /**
   * الأصناف المختارة للتصفية الثابتة — كل صف (فاتورة شراء، صنف):
   *   الكمية   = مجموع كميات الصنف في الفاتورة
   *   القيمة   = Σ الكمية × السعر بالجنيه (أساس النسبة)
   *   المستحق = الكمية × المبلغ للوحدة، أو القيمة × النسبة
   * مثال: 800 كرتونة فريدا والمبلغ 2 ج.م → 1,600.
   * الصنف اللي صاحب الاسم أضافه ولسه ماتوافقش عليه مابيتحسبش.
   */
  private async fixedItems(partner: PartnerRow) {
    const rows = await this.items.selected(partner.id);
    // فاتورة شراء دولار سعرها من دورة الدولار، وغير المسعّرة بالكامل قيمتها غير معروفة
    const fifo = rows.some((r) => r.invoice.currency === 'USD') ? await this.balances.usdFifo() : null;
    const fx = (inv: { id: number; currency: string }) => {
      if (inv.currency !== 'USD') return 1;
      const f = fifo?.byInvoice.get(inv.id);
      return f && f.unpricedUsd <= 1e-9 && f.rate > 0 ? f.rate : null;
    };

    return rows.map((r) => {
      const lines = r.invoice.items.filter((it) => it.productId === r.productId);
      const qty = lines.reduce((s, it) => s + it.qty, 0);
      const rateFx = fx(r.invoice);
      const value = rateFx == null ? null : lines.reduce((s, it) => s + it.qty * it.price, 0) * rateFx;
      const raw = !r.approved ? null
        : r.rate != null ? qty * r.rate
        : r.percent != null && value != null ? (value * r.percent) / 100
        : null;
      return {
        id: r.uid,
        invoiceId: r.invoice.uid,
        productId: r.product.uid,
        approved: r.approved,
        invoiceNo: r.invoice.no,
        date: r.invoice.date,
        supplierName: r.invoice.party?.name ?? '',
        currency: r.invoice.currency,
        productName: r.product.name,
        unit: r.product.unit,
        qty: r2(qty),
        value: value == null ? null : r2(value),
        rate: r.rate,
        percent: r.percent,
        amount: raw == null ? null : r2(raw),
        rawAmount: raw ?? 0,
      };
    });
  }

  async fixedList(partnerUid: string, me: Requester) {
    const partner = await this.access(partnerUid, me);
    this.requireFixedBasis(partner);
    const list = await this.fixedItems(partner);
    return list.map(({ rawAmount, ...rest }) => rest);
  }

  private requireFixedBasis(partner: PartnerRow) {
    if (partner.shareBasis !== 'FIXED') {
      throw new BadRequestException(`طريقة تصفية «${partner.name}» ليست ثابتة`);
    }
  }

  /**
   * «اختيار الأصناف»: أسطر فواتير الشراء اللي اسم صنفها فيه المكتوب، في الفترة
   * المحددة، متجمّعة بالفاتورة. كل صنف عليه علامة لو مختار للاسم ده (وموافق عليه ولا لأ).
   */
  async searchItems(partnerUid: string, q: string, from: string | undefined, to: string | undefined, me: Requester) {
    const partner = await this.access(partnerUid, me);
    this.requireFixedBasis(partner);
    const words = normalizeAr(q ?? '').split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lines = (await this.items.purchaseLines(from ? utcDay(from) : undefined, to ? utcDay(to) : undefined))
      .filter((l) => {
        const name = normalizeAr(l.product.name);
        return words.every((w) => name.includes(w));
      });
    const marks = await this.items.marks(partner.id, [...new Set(lines.map((l) => l.invoice.id))]);
    const mark = new Map(marks.map((m) => [`${m.invoiceId}:${m.productId}`, m.approved]));

    const invoices = new Map<number, {
      invoiceId: string; invoiceNo: string; date: Date; supplierName: string;
      items: Map<number, { productId: string; productName: string; unit: string | null; qty: number; selected: boolean; approved: boolean }>;
    }>();
    for (const l of lines) {
      let inv = invoices.get(l.invoice.id);
      if (!inv) {
        inv = {
          invoiceId: l.invoice.uid, invoiceNo: l.invoice.no, date: l.invoice.date,
          supplierName: l.invoice.party?.name ?? '', items: new Map(),
        };
        invoices.set(l.invoice.id, inv);
      }
      const it = inv.items.get(l.productId);
      if (it) { it.qty += l.qty; continue; }
      const m = mark.get(`${l.invoice.id}:${l.productId}`);
      inv.items.set(l.productId, {
        productId: l.product.uid, productName: l.product.name, unit: l.product.unit,
        qty: l.qty, selected: m !== undefined, approved: m === true,
      });
    }
    return [...invoices.values()].map((inv) => ({
      ...inv,
      items: [...inv.items.values()].map((it) => ({ ...it, qty: r2(it.qty) })),
    }));
  }

  /** المالك يضيف موافقاً عليه، وصاحب الاسم يضيف فينتظر موافقة المالك. */
  async addItems(partnerUid: string, dto: SelectItemsDto, me: Requester) {
    const partner = await this.access(partnerUid, me);
    this.requireFixedBasis(partner);
    const pairs = await this.items.resolve(dto.items);
    const added = await this.items.add(partner.id, pairs, me.admin);
    return { ok: true, added, skipped: pairs.length - added };
  }

  private async itemRow(partner: PartnerRow, invoiceUid: string, productUid: string) {
    const [pair] = await this.items.resolve([{ invoiceId: invoiceUid, productId: productUid }]);
    const row = await this.items.find(partner.id, pair.invoiceId, pair.productId);
    if (!row) throw new NotFoundException('هذا الصنف غير محدد في التصفية');
    return row;
  }

  /** صاحب الاسم يسحب الصنف قبل الموافقة فقط — الموافق عليه يزيله المالك. */
  async removeItem(partnerUid: string, invoiceUid: string, productUid: string, me: Requester) {
    const partner = await this.access(partnerUid, me);
    const row = await this.itemRow(partner, invoiceUid, productUid);
    if (!me.admin && row.approved) {
      throw new ForbiddenException('تمت الموافقة على هذا الصنف. الإزالة للمدير فقط');
    }
    await this.items.remove(row.id);
    return { ok: true };
  }

  /**
   * كتابة المبلغ للوحدة أو النسبة على صنف مختار — واحد منهم، وكتابته هي
   * الموافقة لو صاحب الاسم هو اللي أضافه.
   */
  async setItemRate(partnerUid: string, invoiceUid: string, productUid: string, dto: FixedRateDto, me: Requester) {
    const partner = await this.access(partnerUid, me);
    this.requireFixedBasis(partner);
    let data: { rate: number | null; percent: number | null; approved: boolean };
    if (dto.percent != null) {
      if (!(dto.percent > 0) || dto.percent > 100) {
        throw new BadRequestException('النسبة يجب أن تكون أكبر من صفر وحتى 100%');
      }
      data = { rate: null, percent: dto.percent, approved: true };
    } else {
      if (!(Number(dto.rate) > 0)) throw new BadRequestException('المبلغ للوحدة يجب أن يكون أكبر من صفر');
      data = { rate: Number(dto.rate), percent: null, approved: true };
    }
    const row = await this.itemRow(partner, invoiceUid, productUid);
    await this.items.update(row.id, data);
    const found = (await this.fixedItems(partner)).find((v) => v.id === row.uid);
    if (!found) throw new NotFoundException('هذا الصنف غير محدد في التصفية');
    const { rawAmount, ...rest } = found;
    return rest;
  }

  // --------------------------- حركات رأس المال ---------------------------

  /** رأس المال الحالي = الافتتاحي + مجموع الإضافات والنقص. */
  async capital(partnerUid: string, me: Requester) {
    const partner = await this.access(partnerUid, me);
    const rows = await this.repo.capitalMovements(partner.id);
    const movements = rows.reduce((s, m) => s + m.amount, 0);
    return {
      opening: partner.capital,
      movements: r2(movements),
      current: r2(partner.capital + movements),
      entries: rows.map((m) => ({
        id: m.uid,
        date: m.date,
        amount: m.amount,
        note: m.note,
        createdByName: m.createdBy?.name ?? null,
        createdAt: m.createdAt,
      })),
    };
  }

  /** إضافة أو نقص رأس مال على القديم — للمدير فقط. */
  async addCapitalMovement(
    partnerUid: string,
    dto: { date: string; amount: number; note?: string },
    me: Requester,
  ) {
    const partner = await this.access(partnerUid, me);
    if (partner.shareBasis !== 'CAPITAL') {
      throw new BadRequestException(`طريقة تصفية «${partner.name}» ليست برأس المال`);
    }
    if (!dto.amount) throw new BadRequestException('اكتب مبلغ الإضافة أو النقص');
    await this.repo.createCapitalMovement({
      partnerId: partner.id,
      date: utcDay(dto.date),
      amount: dto.amount,
      note: dto.note || null,
      createdById: me.intId,
    });
    return this.capital(partnerUid, me);
  }

  async deleteCapitalMovement(partnerUid: string, uid: string, me: Requester) {
    const partner = await this.access(partnerUid, me);
    const row = await this.repo.capitalMovementByUid(partner.id, uid);
    await this.repo.deleteCapitalMovement(row.id);
    return this.capital(partnerUid, me);
  }

  // ------------------------------- الدفعات -------------------------------

  /** الدفعات التي تسلّمها الاسم من مستحقه، بإجماليها. */
  async payments(partnerUid: string, me: Requester) {
    const partner = await this.access(partnerUid, me);
    const rows = await this.repo.payments(partner.id);
    return {
      total: r2(rows.reduce((s, p) => s + p.amount, 0)),
      entries: rows.map((p) => ({
        id: p.uid,
        date: p.date,
        amount: p.amount,
        note: p.note,
        createdByName: p.createdBy?.name ?? null,
        createdAt: p.createdAt,
      })),
    };
  }

  /** تسجيل دفعة للاسم — للمدير فقط. */
  async addPayment(
    partnerUid: string,
    dto: { date: string; amount: number; note?: string },
    me: Requester,
  ) {
    const partner = await this.access(partnerUid, me);
    if (!(dto.amount > 0)) throw new BadRequestException('اكتب مبلغ الدفعة');
    await this.repo.createPayment({
      partnerId: partner.id,
      date: utcDay(dto.date),
      amount: dto.amount,
      note: dto.note || null,
      createdById: me.intId,
    });
    return this.payments(partnerUid, me);
  }

  async deletePayment(partnerUid: string, uid: string, me: Requester) {
    const partner = await this.access(partnerUid, me);
    const row = await this.repo.paymentByUid(partner.id, uid);
    await this.repo.deletePayment(row.id);
    return this.payments(partnerUid, me);
  }

  // ----------------------------- كشف الحساب -----------------------------

  /**
   * كشف حساب الشريك: سطر لكل فاتورة مصفّاة بمستحقه منها ومن أين جاء، مع رصيد
   * تراكمي. برأس المال المصدر هو نصيبه من صافي الربح، وبالتصفية الثابتة هو
   * الكمية × المبلغ للوحدة.
   */
  async statement(partnerUid: string, me: Requester) {
    const partner = await this.access(partnerUid, me);

    let rows: {
      date: Date; label: string; source: string; amount: number;
      kind: 'DUE' | 'PAYMENT'; id?: string;
    }[];
    if (partner.shareBasis === 'FIXED') {
      const list = await this.fixedItems(partner);
      rows = list
        .filter((v) => v.amount != null)
        .map((v) => ({
          date: v.date,
          label: `${v.productName} — فاتورة شراء #${v.invoiceNo}`,
          source: `${v.rate != null
            ? `${r2(v.qty)} وحدة × ${v.rate} ج.م`
            : `${v.percent}% من ${r2(v.value ?? 0)} ج.م`}${v.supplierName ? ` — ${v.supplierName}` : ''}`,
          amount: v.rawAmount,
          kind: 'DUE' as const,
        }));
    } else {
      const list = await this.vehicles(partner, true);
      // الفاتورة غير المحسوبة (صنف بدون سعر، أو لا صنف مسعّر فيها) لا تُنتج
      // حركة — سطر بصفر يملأ الكشف بما لا معنى له، والتنبيه الأحمر في تاب
      // التصفية هو موضعه
      rows = list
        .filter((v) => v.rawShare !== null && v.rawCapital > 0)
        .map((v) => ({
          date: v.date,
          label: v.vehicleNo ? `عربية ${v.vehicleNo}` : `فاتورة #${v.invoiceNo}`,
          source: `صافي ربح ${r2(v.rawProfit ?? 0)} × ${v.percent}%${v.clientName ? ` — ${v.clientName}` : ''}`,
          amount: v.rawShare ?? 0,
          kind: 'DUE' as const,
        }));
    }

    const dues = rows.reduce((s, r) => s + r.amount, 0);

    // الدفعات تنزل بالسالب فيبان المتبقي في نفس الكشف
    const paymentRows = await this.repo.payments(partner.id);
    for (const p of paymentRows) {
      rows.push({
        date: p.date,
        label: 'دفعة',
        source: p.note || (p.createdBy?.name ? `سجّلها ${p.createdBy.name}` : 'دفعة مستلمة'),
        amount: -p.amount,
        kind: 'PAYMENT',
        id: p.uid,
      });
    }
    const paid = paymentRows.reduce((s, p) => s + p.amount, 0);

    // الدفعة في نفس يوم الفاتورة تأتي بعدها، فالرصيد يقرأ صحيحاً
    rows.sort((a, b) => (a.date.getTime() - b.date.getTime())
      || (a.kind === b.kind ? 0 : a.kind === 'DUE' ? -1 : 1));
    let running = 0;
    const entries = rows.map((r) => {
      running += r.amount;
      return {
        id: r.id ?? null,
        kind: r.kind,
        date: r.date,
        label: r.label,
        source: r.source,
        amount: r2(r.amount),
        balance: r2(running),
      };
    });

    return {
      partner: this.present(partner),
      /** إجمالي المستحق من الفواتير المحسوبة */
      dues: r2(dues),
      /** إجمالي ما تسلّمه */
      paid: r2(paid),
      /** المتبقي له = المستحق − المدفوع */
      total: r2(dues - paid),
      entries,
    };
  }

  /** تفاصيل عربية: الأصناف وسعر شراء كل صنف وجاي منين. */
  async vehicle(partnerUid: string, invoiceUid: string, me: Requester) {
    const partner = await this.access(partnerUid, me);
    const list = await this.vehicles(partner, true);
    const found = list.find((v) => v.id === invoiceUid);
    if (!found) throw new NotFoundException('هذه العربية غير محددة في التصفية');
    const { rawProfit, rawShare, rawCapital, rawSales, ...rest } = found;
    return rest;
  }

  /**
   * فواتير البيع المرشّحة للتصفية برأس المال، ومعلّم على الداخلة فيها.
   * التصفية الثابتة بتختار أصناف من فواتير الشراء (searchItems / addItems).
   */
  async candidates(partnerUid: string, me: Requester) {
    const partner = await this.access(partnerUid, me);
    this.requireCapitalBasis(partner);
    const list = await this.vehicles(partner, false);
    return list.map(({ lines, rawProfit, rawShare, rawCapital, rawSales, ...rest }) => rest);
  }

  private requireCapitalBasis(partner: PartnerRow) {
    if (partner.shareBasis !== 'CAPITAL') {
      throw new BadRequestException(`طريقة تصفية «${partner.name}» ليست برأس المال`);
    }
  }

  async selectInvoices(partnerUid: string, dto: SelectInvoicesDto, me: Requester) {
    const partner = await this.access(partnerUid, me);
    this.requireCapitalBasis(partner);
    const { ids } = await this.scopeProducts(partner);
    const map = await this.repo.sellableInvoiceIdsByUid(dto.invoiceIds, ids);
    const added = await this.repo.selectInvoices(partner.id, [...map.values()]);
    return { ok: true, added, skipped: map.size - added };
  }

  /** «كل الفواتير مرة واحدة» — بتعلّم على كل مرشّح موجود دلوقتي. */
  async selectAll(partnerUid: string, me: Requester) {
    const partner = await this.access(partnerUid, me);
    this.requireCapitalBasis(partner);
    const { ids } = await this.scopeProducts(partner);
    const invoices = await this.repo.saleInvoices(ids);
    if (!invoices.length) return { ok: true, added: 0, skipped: 0 };
    const added = await this.repo.selectInvoices(partner.id, invoices.map((i) => i.id));
    return { ok: true, added, skipped: invoices.length - added };
  }

  async unselectInvoice(partnerUid: string, invoiceUid: string, me: Requester) {
    const partner = await this.access(partnerUid, me);
    const invoiceId = await this.repo.invoiceIdByUid(invoiceUid);
    return this.repo.unselectInvoice(partner.id, invoiceId);
  }

  async updateVehicle(partnerUid: string, invoiceUid: string, dto: UpdatePartnerVehicleDto, me: Requester) {
    const partner = await this.access(partnerUid, me);
    // عدد الكراتين ومصروف التشغيل من حساب رأس المال وحده
    if (partner.shareBasis !== 'CAPITAL') {
      throw new BadRequestException(`طريقة تصفية «${partner.name}» ليست برأس المال`);
    }
    const invoiceId = await this.repo.invoiceIdByUid(invoiceUid);
    await this.repo.updateVehicle(partner.id, invoiceId, {
      ...(dto.cartons !== undefined ? { cartons: dto.cartons } : {}),
      ...(dto.note !== undefined ? { note: dto.note || null } : {}),
    });
    return this.vehicle(partnerUid, invoiceUid, me);
  }

  /**
   * فرض فترة على صنف في فاتورة. متربوط بـ (فاتورة، صنف) مش بسطر الفاتورة،
   * فبيعيش بعد أي تعديل على الفاتورة. وبما إنه خاصية البضاعة نفسها، كل
   * التصفيات اللي العربية دي داخلة فيها بتقرا نفس الفترة.
   */
  async setItemWeek(partnerUid: string, invoiceUid: string, dto: SetItemWeekDto, me: Requester) {
    const partner = await this.access(partnerUid, me);
    if (!this.usesPriceLists(partner)) {
      throw new BadRequestException(
        `لا يوجد مورد محدد لـ «${partner.name}»، لذلك لا توجد فترات تُحدد للأصناف.`,
      );
    }
    const ids = this.requireSuppliersForLists(partner);
    const invoiceId = await this.repo.invoiceIdByUid(invoiceUid);
    const productId = (await this.repo.productIdsByUid([dto.productId])).get(dto.productId)!;
    let listId: number | null = null;
    if (dto.priceListId) {
      const lists = await this.repo.priceLists(ids);
      const target = lists.find((l) => l.uid === dto.priceListId);
      if (!target) throw new NotFoundException('قائمة الأسعار غير موجودة لموردي هذا الاسم');
      listId = target.id;
    }
    return this.repo.setItemWeek(invoiceId, productId, listId);
  }

  // --------------------------- حساب المورد والإيداعات ---------------------------

  /**
   * الإيداعات عند المورد رصيد عام بيتخصم منه فواتيره، فالرصيد = الإيداعات − الفواتير.
   *
   * بيظهر للاسم المربوط بمورد واحد بس — مع أكتر من مورد الطرح مالوش معنى،
   * ومن غير مورد مفيش حساب أصلاً. جنبه `ledgerBalance` = رصيد الطرف الكامل من
   * BalancesService، عشان الفرق يبان بدل ما يتخبّى.
   */
  async supplierAccount(partner: PartnerRow) {
    if (partner.suppliers.length !== 1) return null;
    const supplier = partner.suppliers[0].supplier;
    const [deposits, invoices, ledgerBalance] = await Promise.all([
      this.repo.deposits(supplier.id),
      this.repo.supplierInvoices(supplier.id),
      this.balances.partyBalance(supplier.id),
    ]);

    const depositsTotal = deposits.reduce((s, d) => s + d.usdAmount, 0);
    const invoiceRows = invoices.map((inv) => {
      const total = inv.items.reduce((s, it) => s + it.qty * it.price, 0);
      return {
        id: inv.uid,
        no: inv.no,
        date: inv.date,
        net: r2(total - (inv.discount || 0)),
        currency: inv.currency,
        exchangeRate: inv.exchangeRate,
      };
    });
    // الإيداعات بالدولار دائماً (DollarAgentTx.usdAmount)، فالفواتير تُحوَّل
    // للدولار قبل الطرح. فاتورة بالجنيه بدون سعر صرف تُستبعد ويظهر تنبيه،
    // بدلاً من طرح جنيه من دولار.
    let invoicesUsd = 0;
    let unconverted = 0;
    for (const inv of invoiceRows) {
      if (inv.currency === 'USD') { invoicesUsd += inv.net; continue; }
      if (inv.exchangeRate && inv.exchangeRate > 0) invoicesUsd += inv.net / inv.exchangeRate;
      else unconverted += 1;
    }

    return {
      // الأرصدة هنا بالدولار لأن الإيداعات بالدولار
      party: { id: supplier.uid, name: supplier.name, currency: 'USD' as const },
      depositsTotal: r2(depositsTotal),
      invoicesTotal: r2(invoicesUsd),
      // المطلوب في التاب: الإيداعات − الفواتير
      balance: r2(depositsTotal - invoicesUsd),
      ledgerBalance: r2(ledgerBalance),
      /** فواتير بعملة غير الدولار بدون سعر صرف — مستبعدة من الطرح */
      mixedCurrency: unconverted > 0,
      unconvertedInvoices: unconverted,
      deposits: deposits.map((d) => ({
        id: d.uid,
        date: d.date,
        amount: d.usdAmount,
        // سعر الإيداع — بيتختم وقت التوريد، ومنه قيمة الإيداع بالجنيه
        depositRate: d.exchangeRate,
        egpValue: r2(d.usdAmount * d.exchangeRate),
        agentName: d.agent?.name ?? null,
        note: d.note,
      })),
      invoices: invoiceRows,
    };
  }
}
