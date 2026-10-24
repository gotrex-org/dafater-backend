import { Injectable } from '@nestjs/common';
import { Activity, InvoiceKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BalancesService } from '../balances/balances.service';
import { computeVehicleProfits, FREIGHT_TX_TYPE } from '../../common/vehicle-profit';

// حركات المصاريف اللي بتتوزّع على النشاطين في تقريري التجارة والشحن.
const EXPENSE_TYPES = ['مصروف', 'مصروف مخزن'];

// Business-intelligence reports aggregated from invoices/returns. The app's scale (a few
// thousand rows) makes in-memory aggregation simpler and fast enough vs. raw SQL.
@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService, private balances: BalancesService) {}

  // مبلغ حركة مصروف: صرف − توريد، أو مبلغ المصروف من غير خزنة (تسوية عهدة كمصروف).
  private expenseAmount(t: { cashOut: number; cashIn: number; expAmt: number }) {
    return (t.cashOut || 0) - (t.cashIn || 0) || t.expAmt || 0;
  }

  // نصيب النشاط من مبلغ: المشترك بيتقسم بالنسبة المتثبّتة على الحركة.
  private portion(amount: number, activity: Activity, shippingPct: number | null, want: 'TRADE' | 'SHIPPING') {
    if (activity === 'SHARED') {
      const ship = (shippingPct ?? 50) / 100;
      return amount * (want === 'SHIPPING' ? ship : 1 - ship);
    }
    return activity === want ? amount : 0;
  }

  private async expenseRows(from?: string, to?: string) {
    const date = this.range(from, to);
    return this.prisma.transaction.findMany({
      where: { type: { in: EXPENSE_TYPES }, ...(date ? { date } : {}) },
      select: {
        type: true, activity: true, shippingPct: true, manifestId: true,
        cashOut: true, cashIn: true, expAmt: true,
        category: { select: { name: true, vehicleLink: true, addsToGoods: true } },
      },
    });
  }

  /**
   * تقرير التجارة: مبيعات الأصناف، تكلفتها، ربح التجارة، والمخزون.
   * التكلفة = الكمية المباعة × متوسط تكلفة الصنف (شامل الناولون الداخلي والشاي والعمولة)،
   * أو سعر التقييم اليدوي لو متحدد على الصنف — نفس تقييم المخزون.
   */
  async tradeReport(from?: string, to?: string) {
    const date = this.range(from, to);
    const invoices = await this.prisma.invoice.findMany({
      where: { fake: false, ...(date ? { date } : {}) },
      select: {
        kind: true, discount: true,
        items: { select: { qty: true, price: true, productId: true, product: { select: { uid: true, name: true, unit: true, service: true } } } },
      },
    });
    const returns = await this.prisma.return.findMany({
      where: date ? { date } : {},
      select: { kind: true, items: { select: { qty: true, price: true, productId: true, product: { select: { service: true } } } } },
    });

    // متوسط التكلفة لكل صنف اتباع في الفترة — مرة واحدة لكل صنف.
    const products = await this.prisma.product.findMany({ where: { service: false }, select: { id: true, price: true } });
    const manual = new Map(products.map((p) => [p.id, p.price]));
    const costCache = new Map<number, number>();
    const unitCost = async (productId: number) => {
      if (!costCache.has(productId)) {
        const m = manual.get(productId) ?? 0;
        costCache.set(productId, m > 0 ? m : await this.balances.avgCost(productId));
      }
      return costCache.get(productId)!;
    };

    let sales = 0, salesDiscount = 0, cogs = 0, purchases = 0, salesCount = 0;
    const byProduct = new Map<string, { name: string; unit: string | null; qty: number; sales: number; cost: number }>();
    for (const inv of invoices) {
      const goods = inv.items.filter((it) => !it.product?.service);
      const total = goods.reduce((s, it) => s + it.qty * it.price, 0);
      // الخصم بيتخصم من الأصناف الأول — نفس ترحيل الفاتورة.
      const disc = Math.min(inv.discount || 0, total);
      if (inv.kind === InvoiceKind.PURCHASE) { purchases += total - disc; continue; }
      if (goods.length) salesCount += 1;
      sales += total;
      salesDiscount += disc;
      for (const it of goods) {
        const c = it.qty * (await unitCost(it.productId));
        cogs += c;
        const key = it.product.uid;
        const row = byProduct.get(key) ?? { name: it.product.name, unit: it.product.unit, qty: 0, sales: 0, cost: 0 };
        row.qty += it.qty; row.sales += it.qty * it.price; row.cost += c;
        byProduct.set(key, row);
      }
    }
    let salesReturns = 0, returnsCost = 0;
    for (const r of returns) {
      if (r.kind !== InvoiceKind.SALE) continue;
      for (const it of r.items) {
        if (it.product?.service) continue;
        salesReturns += it.qty * it.price;
        returnsCost += it.qty * (await unitCost(it.productId));
      }
    }

    const expenses = await this.expenseRows(from, to);
    let tradeExpenses = 0;
    const expByCat = new Map<string, number>();
    for (const e of expenses) {
      const amt = this.portion(this.expenseAmount(e), e.activity, e.shippingPct, 'TRADE');
      if (!amt) continue;
      tradeExpenses += amt;
      const k = e.category?.name ?? 'بدون بند';
      expByCat.set(k, (expByCat.get(k) ?? 0) + amt);
    }

    const warehouses = await this.prisma.warehouse.findMany({ select: { id: true, uid: true, name: true } });
    const inventory = await Promise.all(warehouses.map(async (w) => ({
      id: w.uid, name: w.name, value: await this.balances.warehouseValue(w.id),
    })));

    const netSales = sales - salesDiscount - salesReturns;
    const cost = cogs - returnsCost;
    const grossProfit = netSales - cost;
    return {
      sales, salesDiscount, salesReturns, netSales, salesCount,
      cost, grossProfit,
      expenses: tradeExpenses,
      expensesByCategory: [...expByCat.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total),
      netProfit: grossProfit - tradeExpenses,
      purchases,
      products: [...byProduct.entries()]
        .map(([id, v]) => ({ id, ...v, profit: v.sales - v.cost }))
        .sort((a, b) => b.sales - a.sales),
      // المخزون الحالي (مش مرتبط بالفترة)
      inventory: { total: inventory.reduce((s, w) => s + w.value, 0), warehouses: inventory },
    };
  }

  /**
   * تقرير الشحن: إيرادات البنود، تكاليف العربيات، مصاريف المخزن، وربح الشحن.
   *   الإيراد = بنود الشحن على فواتير البيع (+ الأصناف الخدمية القديمة) + العطلة وفرق الوزن على العملاء
   *   تكاليف العربيات = الإيجار + الجمرك والتخليص + التحميل والشفتنة + عطلة وفرق وزن وشاي السائقين
   *                     + بنود الشحن على فواتير الشراء + ناولون فواتير البيع المربوطة بعربية
   *   مصاريف المخزن = مصاريف بنشاط الشحن (غير التحميل والشفتنة) + نصيب الشحن من المرتبات
   */
  async shippingSummary(from?: string, to?: string) {
    const date = this.range(from, to);
    const dateWhere = date ? { date } : {};

    const charges = await this.prisma.invoiceCharge.findMany({
      where: { invoice: { fake: false, ...dateWhere } },
      select: { qty: true, price: true, chargeType: { select: { name: true } }, invoice: { select: { kind: true } } },
    });
    const legacy = await this.prisma.invoiceItem.findMany({
      where: { product: { service: true }, invoice: { fake: false, ...dateWhere } },
      select: { qty: true, price: true, product: { select: { name: true } }, invoice: { select: { kind: true } } },
    });
    const incomeBy = new Map<string, number>();
    const purchaseChargesBy = new Map<string, number>();
    for (const c of [
      ...charges.map((c) => ({ name: c.chargeType.name, total: c.qty * c.price, kind: c.invoice.kind })),
      ...legacy.map((l) => ({ name: l.product.name, total: l.qty * l.price, kind: l.invoice.kind })),
    ]) {
      const m = c.kind === InvoiceKind.SALE ? incomeBy : purchaseChargesBy;
      m.set(c.name, (m.get(c.name) ?? 0) + c.total);
    }

    const sumType = async (types: string[], field: 'debit' | 'credit' | 'cashOut') => {
      const agg = await this.prisma.transaction.aggregate({ where: { type: { in: types }, ...dateWhere }, _sum: { [field]: true } as any });
      return Number((agg._sum as any)[field]) || 0;
    };
    const truckDelay = await sumType(['truckDelay'], 'debit');
    const truckWeightDiff = await sumType(['truckWeightDiff'], 'debit');
    const customs = await sumType(['جمارك'], 'credit');
    const driverExtras = await sumType(['driverDelay', 'driverWeightDiff', 'driverTea'], 'cashOut');
    // ناولون فواتير البيع المربوطة بعربية — تكلفة شحن على العربية (نفس ربح كل عربية).
    const freightAgg = await this.prisma.transaction.aggregate({
      where: { type: FREIGHT_TX_TYPE, invoice: { kind: InvoiceKind.SALE, fake: false, manifests: { some: {} } }, ...dateWhere },
      _sum: { cashOut: true, cashIn: true },
    });
    const invoiceFreight = (freightAgg._sum.cashOut || 0) - (freightAgg._sum.cashIn || 0);

    const trips = await this.prisma.driverTrip.aggregate({
      where: date ? { departureDate: date } : {},
      _sum: { agreedFreight: true },
      _count: true,
    });
    const rent = trips._sum.agreedFreight || 0;

    const expenses = await this.expenseRows(from, to);
    const vehicleBy = new Map<string, number>();
    const warehouseBy = new Map<string, number>();
    for (const e of expenses) {
      const amt = this.portion(this.expenseAmount(e), e.activity, e.shippingPct, 'SHIPPING');
      if (!amt) continue;
      const m = e.category?.vehicleLink ? vehicleBy : warehouseBy;
      const k = e.category?.name ?? (e.type === 'مصروف مخزن' ? 'مصاريف مخزن (بدون بند)' : 'مصاريف (بدون بند)');
      m.set(k, (m.get(k) ?? 0) + amt);
    }

    const list = (m: Map<string, number>) =>
      [...m.entries()].map(([name, total]) => ({ name, total })).filter((x) => Math.abs(x.total) > 0.001).sort((a, b) => b.total - a.total);
    const total = (xs: { total: number }[]) => xs.reduce((s, x) => s + x.total, 0);

    const incomeCharges = list(incomeBy);
    const income = {
      charges: incomeCharges,
      chargesTotal: total(incomeCharges),
      truckDelay,
      truckWeightDiff,
    };
    const incomeTotal = income.chargesTotal + truckDelay + truckWeightDiff;

    const vehicleExpenses = list(vehicleBy);
    const purchaseCharges = list(purchaseChargesBy);
    const vehicleCosts = {
      rent,
      customs,
      loading: vehicleExpenses, // التحميل والشفتنة (وأي بند مربوط بعربية)
      loadingTotal: total(vehicleExpenses),
      driverExtras,              // عطلة وفرق وزن وشاي السائقين
      invoiceFreight,            // ناولون فواتير البيع المربوطة بعربية
      purchaseCharges,           // بنود شحن على فواتير الشراء
      purchaseChargesTotal: total(purchaseCharges),
    };
    const vehicleCostsTotal = rent + customs + vehicleCosts.loadingTotal + driverExtras + invoiceFreight + vehicleCosts.purchaseChargesTotal;

    const warehouseExpenses = list(warehouseBy);
    const warehouseTotal = total(warehouseExpenses);

    return {
      income, incomeTotal,
      vehicleCosts, vehicleCostsTotal,
      warehouseExpenses, warehouseTotal,
      trips: trips._count,
      profit: incomeTotal - vehicleCostsTotal - warehouseTotal,
    };
  }

  /** ربح كل عربية لوحدها في الفترة (بتاريخ الكشف). */
  async vehicleProfits(from?: string, to?: string) {
    const date = this.range(from, to);
    const rows = await computeVehicleProfits(this.prisma, date ? { date } : {});
    const vehicles = rows.map((r) => ({
      id: r.id, no: r.no, date: r.date, clientName: r.clientName,
      vehicleNo: r.vehicleNo, trailerNo: r.trailerNo, vehicleLabel: r.vehicleLabel, driverName: r.driverName,
      invoice: r.invoice,
      revenue: r.revenueTotal,
      rent: r.rent.total,
      customs: r.customs.total,
      loading: r.vehicleExpenses.total,
      freight: r.freight.total,
      costs: r.costs,
      profit: r.profit,
      unassigned: r.unassignedCharges.reduce((s, c) => s + c.total, 0),
    }));
    const sum = (k: 'revenue' | 'rent' | 'customs' | 'loading' | 'freight' | 'costs' | 'profit') => vehicles.reduce((s, v) => s + v[k], 0);
    return {
      vehicles,
      totals: { revenue: sum('revenue'), rent: sum('rent'), customs: sum('customs'), loading: sum('loading'), freight: sum('freight'), costs: sum('costs'), profit: sum('profit') },
    };
  }

  private range(from?: string, to?: string) {
    if (!from && !to) return undefined;
    return {
      gte: from ? new Date(from) : undefined,
      lt: to ? new Date(new Date(to).getTime() + 86400000) : undefined,
    };
  }

  private saleInvoices(from?: string, to?: string) {
    const date = this.range(from, to);
    return this.prisma.invoice.findMany({
      where: { kind: InvoiceKind.SALE, fake: false, ...(date ? { date } : {}) },
      select: { date: true, party: { select: { uid: true, name: true } }, items: { select: { qty: true, price: true, product: { select: { uid: true, name: true, unit: true } } } } },
    });
  }

  // أكتر صنف شغّال — best-selling products by quantity and revenue (sales).
  async topProducts(from?: string, to?: string, limit = 20) {
    const invoices = await this.saleInvoices(from, to);
    const byProduct = new Map<string, { name: string; unit: string | null; qty: number; revenue: number }>();
    for (const inv of invoices) {
      for (const it of inv.items) {
        const key = it.product?.uid ?? '—';
        const cur = byProduct.get(key) ?? { name: it.product?.name ?? '—', unit: it.product?.unit ?? null, qty: 0, revenue: 0 };
        cur.qty += it.qty;
        cur.revenue += it.qty * it.price;
        byProduct.set(key, cur);
      }
    }
    return [...byProduct.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, limit);
  }

  // أكتر عميل/مورد شغّال — parties ranked by total value and invoice count.
  async topParties(kind: InvoiceKind, from?: string, to?: string, limit = 20) {
    const date = this.range(from, to);
    const invoices = await this.prisma.invoice.findMany({
      where: { kind, fake: false, ...(date ? { date } : {}) },
      select: { party: { select: { uid: true, name: true } }, items: { select: { qty: true, price: true } } },
    });
    const byParty = new Map<string, { name: string; total: number; count: number }>();
    for (const inv of invoices) {
      const key = inv.party?.uid ?? '—';
      const total = inv.items.reduce((s, it) => s + it.qty * it.price, 0);
      const cur = byParty.get(key) ?? { name: inv.party?.name ?? '—', total: 0, count: 0 };
      cur.total += total;
      cur.count += 1;
      byParty.set(key, cur);
    }
    return [...byParty.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }

  // أكتر وقت اشتغل فيه المخزن — sales activity by month and by day-of-week.
  async busiest(from?: string, to?: string) {
    const invoices = await this.saleInvoices(from, to);
    const byMonth = new Map<string, { total: number; count: number }>();
    const dow = Array.from({ length: 7 }, () => ({ total: 0, count: 0 }));
    const DOW_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    for (const inv of invoices) {
      const total = inv.items.reduce((s, it) => s + it.qty * it.price, 0);
      const d = new Date(inv.date);
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const cm = byMonth.get(m) ?? { total: 0, count: 0 };
      cm.total += total; cm.count += 1;
      byMonth.set(m, cm);
      const w = d.getDay();
      dow[w].total += total; dow[w].count += 1;
    }
    const months = [...byMonth.entries()].map(([month, v]) => ({ month, ...v })).sort((a, b) => a.month.localeCompare(b.month));
    const weekdays = dow.map((v, i) => ({ day: DOW_NAMES[i], ...v }));
    const peakMonth = [...months].sort((a, b) => b.total - a.total)[0] ?? null;
    const peakDay = [...weekdays].sort((a, b) => b.total - a.total)[0] ?? null;
    return { months, weekdays, peakMonth, peakDay };
  }

  // عملاء بقالهم فترة ما اشتغلوش — clients who transacted before but not in the last N days.
  async inactiveClients(minDays = 45) {
    const clients = await this.prisma.party.findMany({
      where: { role: 'CLIENT', hidden: false },
      select: { id: true, uid: true, name: true },
    });
    if (!clients.length) return [];
    const acts = await this.prisma.transaction.groupBy({
      by: ['partyId'],
      _max: { date: true },
      where: { partyId: { in: clients.map((c) => c.id) } },
    });
    const lastById = new Map(acts.map((a) => [a.partyId, a._max.date]));
    const now = Date.now();
    return clients
      .map((c) => {
        const last = lastById.get(c.id) ?? null;
        const daysSince = last ? Math.floor((now - new Date(last).getTime()) / 86400000) : null;
        return { id: c.uid, name: c.name, lastActivity: last, daysSince };
      })
      .filter((r) => r.daysSince != null && r.daysSince >= minDays)
      .sort((a, b) => (b.daysSince || 0) - (a.daysSince || 0));
  }

  // Headline totals for the period — التجارة (بضاعة) بس.
  //
  // النشاطين بيمرّوا على نفس جدول الفواتير: بنود البضاعة نشاط التجارة، وبنود الخدمات
  // (`Product.service` — ناولون/تحميل/شفتنة…) نشاط الشحن. من غير الفصل ده الناولون
  // بيتجمّع مع البضاعة، فالمشتريات تطلع منفوخة والفرق بينها وبين المبيعات ملوش معنى.
  // `sales`/`purchases` هنا بضاعة بس؛ بنود الخدمات بترجع في `services` وتفصيلها في
  // shippingSummary(). أي حاسب تاني (الداشبورد، profitLoss) بياخد أرقام التجارة صح.
  async summary(from?: string, to?: string) {
    const date = this.range(from, to);
    const invoices = await this.prisma.invoice.findMany({
      where: { fake: false, ...(date ? { date } : {}) },
      select: {
        kind: true,
        items: { select: { qty: true, price: true, freight: true, tea: true, product: { select: { service: true } } } },
      },
    });
    let sales = 0, purchases = 0, salesCount = 0, purchasesCount = 0;
    // الناولون الداخلي والشاي على بنود الشراء — تكاليف بتتضاف على تكلفة الصنف (landed cost).
    let addedCosts = 0;
    // بنود الخدمات: على فاتورة البيع = محصّل من العميل، وعلى الشراء = مدفوع.
    let servicesCollected = 0, servicesPaid = 0;
    for (const inv of invoices) {
      let goods = 0, services = 0, extra = 0;
      for (const it of inv.items) {
        if (it.product?.service) services += it.qty * it.price;
        else goods += it.qty * it.price;
        extra += (it.freight || 0) + (it.tea || 0);
      }
      if (inv.kind === InvoiceKind.SALE) {
        sales += goods; salesCount += 1; servicesCollected += services;
      } else {
        purchases += goods; purchasesCount += 1; servicesPaid += services; addedCosts += extra;
      }
    }
    // بنود الشحن في جدولها المنفصل — نفس معاملة الأصناف الخدمية القديمة.
    const charges = await this.prisma.invoiceCharge.findMany({
      where: { invoice: { fake: false, ...(date ? { date } : {}) } },
      select: { qty: true, price: true, invoice: { select: { kind: true } } },
    });
    for (const c of charges) {
      if (c.invoice.kind === InvoiceKind.SALE) servicesCollected += c.qty * c.price;
      else servicesPaid += c.qty * c.price;
    }
    const returns = await this.prisma.return.findMany({
      where: date ? { date } : {},
      select: { kind: true, items: { select: { qty: true, price: true, product: { select: { service: true } } } } },
    });
    let salesReturns = 0, purchaseReturns = 0;
    for (const r of returns) {
      const total = r.items.reduce((s, it) => (it.product?.service ? s : s + it.qty * it.price), 0);
      if (r.kind === InvoiceKind.SALE) salesReturns += total; else purchaseReturns += total;
    }
    return {
      sales, purchases, salesCount, purchasesCount,
      salesReturns, purchaseReturns,
      addedCosts,
      // تكلفة البضاعة الحقيقية عليك = سعر الشراء + الناولون الداخلي + الشاي
      landedPurchases: purchases + addedCosts,
      netSales: sales - salesReturns,
      grossProfit: (sales - salesReturns) - (purchases + addedCosts - purchaseReturns),
      services: { collected: servicesCollected, paid: servicesPaid },
    };
  }

  // ربح وخسارة — revenue vs. cost vs. expenses for the period. Expenses split into
  // operating (salaries/rent — standalone) and goods-related (freight/شاي — added to cost).
  async profitLoss(from?: string, to?: string) {
    const s = await this.summary(from, to);
    const date = this.range(from, to);
    // كل حركة صرف/توريد بتأثر بالصافي: صرف (cashOut) − توريد (cashIn).
    const net = (agg: { _sum: { cashOut: number | null; cashIn: number | null } }) =>
      (agg._sum.cashOut || 0) - (agg._sum.cashIn || 0);

    const opAgg = await this.prisma.transaction.aggregate({
      where: { type: 'مصروف', ...(date ? { date } : {}), OR: [{ categoryId: null }, { category: { addsToGoods: false } }] },
      _sum: { cashOut: true, cashIn: true },
    });
    const goodsAgg = await this.prisma.transaction.aggregate({
      where: { type: 'مصروف', ...(date ? { date } : {}), category: { addsToGoods: true } },
      _sum: { cashOut: true, cashIn: true },
    });
    // مصاريف المخزن (إيجار/مرتبات/تحميل/تخليص) — تشغيلية
    const whAgg = await this.prisma.transaction.aggregate({
      where: { type: 'مصروف مخزن', ...(date ? { date } : {}) },
      _sum: { cashOut: true, cashIn: true },
    });
    // مصاريف بضاعة نقدية (شامل الناولون والشاي) — تتضاف على التكلفة. نستثني حركات البيع
    // الخارجي (dealId) لأن الربح والخسارة ده مبني على الفواتير مش الصفقات.
    const goodsCashAgg = await this.prisma.transaction.aggregate({
      where: { type: { in: ['مصروف بضاعة', 'ناولون', 'شاي'] }, dealId: null, ...(date ? { date } : {}) },
      _sum: { cashOut: true, cashIn: true },
    });
    // تسوية نقدية — تتخصم من الصافي في الآخر
    const settleAgg = await this.prisma.transaction.aggregate({
      where: { type: 'تسوية نقدية', ...(date ? { date } : {}) },
      _sum: { cashOut: true, cashIn: true },
    });

    const warehouseExpenses = net(whAgg);
    const expenses = net(opAgg) + warehouseExpenses;   // مصاريف تشغيلية (شخصية + مخزن)
    const goodsExpenses = net(goodsAgg) + net(goodsCashAgg); // مصاريف على البضاعة
    const settlement = net(settleAgg);                 // تسويات نقدية
    const revenue = s.netSales;
    const cost = (s.purchases - s.purchaseReturns) + goodsExpenses;
    const grossProfit = revenue - cost;
    return {
      revenue,
      cost,             // net purchases + مصاريف البضاعة
      goodsExpenses,
      grossProfit,
      expenses,         // مصاريف تشغيلية (شخصية + مخزن)
      warehouseExpenses, // مصاريف المخزن لوحدها (جزء من expenses)
      settlement,       // تسويات نقدية
      netProfit: grossProfit - expenses - settlement,
    };
  }

  // مصاريف بمجموعتين رئيسيتين (مصاريف مخزن / مصاريف خارجية) وجوه كل مجموعة بنود.
  // بتوحّد المصادر: مصاريف الحركة اليومية + ناولون/شاي الفواتير + ناولون السائقين — كله
  // بيتجمّع تحت نفس البند حسب نوع الحركة أو البند المختار.
  async expensesByCategory(from?: string, to?: string) {
    const date = this.range(from, to);
    // نوع الحركة (لو مالوش بند مختار) → { المجموعة، اسم البند الافتراضي }
    const TYPE_MAP: Record<string, { group: 'WAREHOUSE' | 'EXTERNAL'; name: string }> = {
      'مصروف مخزن': { group: 'WAREHOUSE', name: 'مصاريف مخزن (غير مصنّف)' },
      'ناولون': { group: 'EXTERNAL', name: 'ناولون داخلي' },
      'شاي': { group: 'EXTERNAL', name: 'شاي' },
      'driverFreight': { group: 'EXTERNAL', name: 'ناولون خارجي' },
      'ناولون خارجي': { group: 'EXTERNAL', name: 'ناولون خارجي' },
      'مصروف بضاعة': { group: 'EXTERNAL', name: 'مصاريف بضاعة' },
      'مصروف': { group: 'EXTERNAL', name: 'مصاريف عامة' },
      'تسوية نقدية': { group: 'EXTERNAL', name: 'تسويات' },
    };
    const rows = await this.prisma.transaction.findMany({
      where: {
        ...(date ? { date } : {}),
        OR: [{ type: { in: Object.keys(TYPE_MAP) } }, { categoryId: { not: null } }],
      },
      select: { type: true, cashOut: true, cashIn: true, category: { select: { name: true, group: true } } },
    });

    const groups: Record<'WAREHOUSE' | 'EXTERNAL', Map<string, number>> = { WAREHOUSE: new Map(), EXTERNAL: new Map() };
    for (const r of rows) {
      const fallback = TYPE_MAP[r.type];
      // البند المختار له الأولوية؛ لو مفيش، نرجع لنوع الحركة.
      const g = (r.category?.group as 'WAREHOUSE' | 'EXTERNAL' | undefined) ?? fallback?.group;
      const name = r.category?.name ?? fallback?.name;
      if (!g || !name) continue;
      const amt = (Number(r.cashOut) || 0) - (Number(r.cashIn) || 0);
      groups[g].set(name, (groups[g].get(name) ?? 0) + amt);
    }

    const build = (key: 'WAREHOUSE' | 'EXTERNAL', label: string) => {
      const items = [...groups[key].entries()]
        .map(([name, total]) => ({ name, total }))
        .filter((x) => Math.abs(x.total) > 0.001)
        .sort((a, b) => b.total - a.total);
      return { key, label, total: items.reduce((s, x) => s + x.total, 0), items };
    };
    const list = [build('WAREHOUSE', 'مصاريف مخزن'), build('EXTERNAL', 'مصاريف خارجية')];
    return { total: list.reduce((s, g) => s + g.total, 0), groups: list };
  }

  // أكتر فترة اشتغل فيها عميل/مورد/صنف معيّن — للـ Peak (اختيار جهة وشوف نشاطها الشهري).
  async busiestFor(type: 'client' | 'supplier' | 'product', id: string, from?: string, to?: string) {
    const date = this.range(from, to);
    let invoices: { date: Date; items: { qty: number; price: number }[] }[] = [];
    if (type === 'product') {
      invoices = await this.prisma.invoice.findMany({
        where: { kind: InvoiceKind.SALE, fake: false, ...(date ? { date } : {}), items: { some: { product: { uid: id } } } },
        select: { date: true, items: { where: { product: { uid: id } }, select: { qty: true, price: true } } },
      });
    } else {
      const kind = type === 'supplier' ? InvoiceKind.PURCHASE : InvoiceKind.SALE;
      invoices = await this.prisma.invoice.findMany({
        where: { kind, fake: false, party: { uid: id }, ...(date ? { date } : {}) },
        select: { date: true, items: { select: { qty: true, price: true } } },
      });
    }
    const byMonth = new Map<string, { total: number; count: number }>();
    for (const inv of invoices) {
      const total = inv.items.reduce((s, it) => s + it.qty * it.price, 0);
      const d = new Date(inv.date);
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const cur = byMonth.get(m) ?? { total: 0, count: 0 };
      cur.total += total; cur.count += 1;
      byMonth.set(m, cur);
    }
    const months = [...byMonth.entries()].map(([month, v]) => ({ month, ...v })).sort((a, b) => a.month.localeCompare(b.month));
    const peak = [...months].sort((a, b) => b.total - a.total)[0] ?? null;
    return { months, peak };
  }

  // أرصدة العُهَد — كل شخص (PERSON) شايل فلوس عهدة/أمانة وكام لسه عليه.
  async custodyBalances() {
    const persons = await this.prisma.party.findMany({
      where: { role: 'PERSON' },
      select: { id: true, uid: true, name: true, opening: true },
    });
    if (!persons.length) return { total: 0, holders: [] };
    const agg = await this.prisma.transaction.groupBy({
      by: ['partyId'],
      _sum: { debit: true, credit: true },
      where: { partyId: { in: persons.map((p) => p.id) } },
    });
    const byId = new Map(agg.map((a) => [a.partyId, (a._sum.debit || 0) - (a._sum.credit || 0)]));
    const holders = persons
      .map((p) => ({ id: p.uid, name: p.name, balance: (p.opening || 0) + (byId.get(p.id) || 0) }))
      .filter((h) => Math.abs(h.balance) > 0.001)
      .sort((a, b) => b.balance - a.balance);
    const total = holders.reduce((s, h) => s + h.balance, 0);
    return { total, holders };
  }

  // مصاريف المخزن — تفصيل مصاريف كل مخزن (إيجار/مرتبات/تحميل/تخليص...) خلال الفترة.
  async warehouseExpenses(from?: string, to?: string) {
    const date = this.range(from, to);
    const rows = await this.prisma.transaction.findMany({
      where: { type: 'مصروف مخزن', ...(date ? { date } : {}) },
      select: {
        date: true, cashOut: true, cashIn: true, note: true,
        warehouse: { select: { uid: true, name: true } },
        category: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
    });
    const byWarehouse = new Map<string, { name: string; total: number; byCategory: Map<string, number> }>();
    for (const r of rows) {
      const key = r.warehouse?.uid ?? '—';
      const amt = (Number(r.cashOut) || 0) - (Number(r.cashIn) || 0);
      const cur = byWarehouse.get(key) ?? { name: r.warehouse?.name ?? '—', total: 0, byCategory: new Map() };
      cur.total += amt;
      const cat = r.category?.name ?? 'أخرى';
      cur.byCategory.set(cat, (cur.byCategory.get(cat) ?? 0) + amt);
      byWarehouse.set(key, cur);
    }
    const warehouses = [...byWarehouse.entries()]
      .map(([id, v]) => ({ id, name: v.name, total: v.total, categories: [...v.byCategory.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total) }))
      .sort((a, b) => b.total - a.total);
    const total = warehouses.reduce((sm, w) => sm + w.total, 0);
    return { total, warehouses };
  }
}
