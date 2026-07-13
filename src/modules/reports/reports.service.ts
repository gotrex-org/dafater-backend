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
      where: { kind: InvoiceKind.SALE, ...(date ? { date } : {}) },
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
      where: { kind, ...(date ? { date } : {}) },
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

  // Headline totals for the period.
  async summary(from?: string, to?: string) {
    const date = this.range(from, to);
    const invoices = await this.prisma.invoice.findMany({
      where: date ? { date } : {},
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
}
