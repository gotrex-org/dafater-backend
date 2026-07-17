import { Injectable } from '@nestjs/common';
import { InvoiceKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Business-intelligence reports aggregated from invoices/returns. The app's scale (a few
// thousand rows) makes in-memory aggregation simpler and fast enough vs. raw SQL.
@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

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

  // Headline totals for the period.
  async summary(from?: string, to?: string) {
    const date = this.range(from, to);
    const invoices = await this.prisma.invoice.findMany({
      where: { fake: false, ...(date ? { date } : {}) },
      select: { kind: true, items: { select: { qty: true, price: true } } },
    });
    let sales = 0, purchases = 0, salesCount = 0, purchasesCount = 0;
    for (const inv of invoices) {
      const total = inv.items.reduce((s, it) => s + it.qty * it.price, 0);
      if (inv.kind === InvoiceKind.SALE) { sales += total; salesCount += 1; }
      else { purchases += total; purchasesCount += 1; }
    }
    const returns = await this.prisma.return.findMany({
      where: date ? { date } : {},
      select: { kind: true, items: { select: { qty: true, price: true } } },
    });
    let salesReturns = 0, purchaseReturns = 0;
    for (const r of returns) {
      const total = r.items.reduce((s, it) => s + it.qty * it.price, 0);
      if (r.kind === InvoiceKind.SALE) salesReturns += total; else purchaseReturns += total;
    }
    return {
      sales, purchases, salesCount, purchasesCount,
      salesReturns, purchaseReturns,
      netSales: sales - salesReturns,
      grossProfit: (sales - salesReturns) - (purchases - purchaseReturns),
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
