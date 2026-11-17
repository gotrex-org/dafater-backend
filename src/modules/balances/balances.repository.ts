import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { computeUsdFifo, type FifoResult } from '../../common/usd-fifo';

@Injectable()
export class BalancesRepository {
  constructor(private prisma: PrismaService) {}

  async partyBalance(partyId: number): Promise<number> {
    const party = await this.prisma.party.findUnique({ where: { id: partyId } });
    if (!party) return 0;
    const agg = await this.prisma.transaction.aggregate({
      where: { partyId },
      _sum: { debit: true, credit: true },
    });
    return (party.opening || 0) + (agg._sum.debit || 0) - (agg._sum.credit || 0);
  }

  async partyBalanceMulti(partyIds: number[]): Promise<number> {
    const parties = await this.prisma.party.findMany({ where: { id: { in: partyIds } } });
    const agg = await this.prisma.transaction.aggregate({
      where: { partyId: { in: partyIds } },
      _sum: { debit: true, credit: true },
    });
    const totalOpening = parties.reduce((s, p) => s + (Number(p.opening) || 0), 0);
    return totalOpening + (agg._sum.debit || 0) - (agg._sum.credit || 0);
  }

  // دورة الدولار (common/usd-fifo.ts): قيمة كل حركة على طرف دولاري بالجنيه، FIFO
  // على دفعات الوكيل بسعر صرفها.
  async usdFifo(): Promise<FifoResult> {
    const parties = await this.prisma.party.findMany({ where: { currency: 'USD' }, select: { id: true, opening: true } });
    if (!parties.length) return computeUsdFifo([], []);
    const txs = await this.prisma.transaction.findMany({
      where: { partyId: { in: parties.map((p) => p.id) } },
      select: {
        id: true, partyId: true, date: true, createdAt: true, debit: true, credit: true,
        cashIn: true, cashOut: true, exchangeRate: true, invoiceId: true,
      },
    });
    // كل أسعار توريد الوكلاء بتواريخها: الحركة المربوطة تأخذ سعرها، والحركة بدون سعر
    // تأخذ سعر الوكيل في تاريخها.
    const agentTxs = await this.prisma.dollarAgentTx.findMany({
      where: { type: 'USD_OUT', exchangeRate: { gt: 0 } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: { date: true, exchangeRate: true, txId: true },
    });
    const rateByTx = new Map(agentTxs.filter((a) => a.txId != null).map((a) => [a.txId!, a.exchangeRate]));
    return computeUsdFifo(
      parties.map((p) => ({ id: p.id, opening: Number(p.opening) || 0 })),
      txs.map((t) => ({
        ...t, partyId: t.partyId!, debit: Number(t.debit) || 0, credit: Number(t.credit) || 0,
        cashIn: Number(t.cashIn) || 0, cashOut: Number(t.cashOut) || 0, exchangeRate: Number(t.exchangeRate) || 0,
        agentRate: rateByTx.get(t.id),
      })),
      agentTxs.map((a) => ({ date: a.date, rate: a.exchangeRate })),
    );
  }

  // سعر تحويل رصيد الطرف الدولاري للجنيه = رصيده بالجنيه (FIFO) ÷ رصيده بالدولار.
  // كل الشاشات اللي بتضرب الرصيد × السعر (الميزان، الرئيسية، كشف الحساب) تطلع
  // بالتالي قيمة الدورة: الشرائح المتبقية بسعرها الحقيقي، وغير المسعّر بآخر سعر.
  async avgExchangeRateByParty(): Promise<Record<number, number>> {
    const { byParty } = await this.usdFifo();
    const out: Record<number, number> = {};
    for (const [pid, v] of byParty) {
      out[pid] = Math.abs(v.usdBalance) > 1e-9 ? v.egpBalance / v.usdBalance : v.lastRate;
    }
    return out;
  }

  async allPartyBalances(): Promise<Record<number, number>> {
    const parties = await this.prisma.party.findMany();
    const grouped = await this.prisma.transaction.groupBy({
      by: ['partyId'],
      where: { partyId: { not: null } },
      _sum: { debit: true, credit: true },
    });
    const byId: Record<number, number> = {};
    for (const p of parties) byId[p.id] = p.opening || 0;
    for (const g of grouped) {
      if (g.partyId == null) continue;
      byId[g.partyId] = (byId[g.partyId] || 0) + (g._sum.debit || 0) - (g._sum.credit || 0);
    }
    return byId;
  }

  async treasuryBalance(treasuryId: number): Promise<number> {
    const acc = await this.prisma.treasuryAccount.findUnique({ where: { id: treasuryId } });
    if (!acc) return 0;
    const primary = await this.prisma.transaction.aggregate({
      where: { treasuryId },
      _sum: { cashIn: true, cashOut: true },
    });
    const secondary = await this.prisma.transaction.aggregate({
      where: { treasuryId2: treasuryId },
      _sum: { cashIn2: true, cashOut2: true },
    });
    return (
      (acc.opening || 0) +
      (primary._sum.cashIn || 0) -
      (primary._sum.cashOut || 0) +
      (secondary._sum.cashIn2 || 0) -
      (secondary._sum.cashOut2 || 0)
    );
  }

  async allTreasuryBalances() {
    const accounts = await this.prisma.treasuryAccount.findMany();
    return Promise.all(accounts.map(async (a) => ({ ...a, balance: await this.treasuryBalance(a.id) })));
  }

  /**
   * رصيد الصنف. `warehouseId` اختياري: من غيره بيرجّع الإجمالي الموجود في كل
   * المخازن مع بعض — وده اللي بيتعرض في كارت الصنف.
   */
  async stockOf(productId: number, warehouseId?: number): Promise<number> {
    // `undefined` في شرط Prisma معناها «متفلترش بالحقل ده» — فنفس الكود بيخدم
    // مخزن واحد والإجمالي.
    const items = await this.prisma.invoiceItem.findMany({
      where: { productId, invoice: { warehouseId, fake: false } },
      select: { qty: true, invoice: { select: { kind: true } } },
    });
    let qty = 0;
    for (const it of items) qty += it.invoice.kind === 'PURCHASE' ? it.qty : -it.qty;
    // Returns move stock the opposite way to the sale/purchase they reverse: a SALE return
    // brings goods back (qty +), a PURCHASE return sends goods out to the supplier (qty -).
    const returnItems = await this.prisma.returnItem.findMany({
      where: { productId, return: { warehouseId } },
      select: { qty: true, return: { select: { kind: true } } },
    });
    for (const it of returnItems) qty += it.return.kind === 'SALE' ? it.qty : -it.qty;
    const adj = await this.prisma.adjustment.aggregate({
      where: { productId, warehouseId },
      _sum: { qty: true },
    });
    qty += adj._sum.qty || 0;
    const loans = await this.prisma.loan.findMany({
      where: { productId, warehouseId },
      select: { qty: true, returnedQty: true, cashReturnedQty: true },
    });
    for (const loan of loans) {
      qty -= loan.qty;
      qty += loan.returnedQty ?? 0;
    }
    return qty;
  }

  /**
   * فواتير شراء الصنف بتكلفة الوحدة، من الأحدث للأقدم. التكلفة تشمل الناولون والشاي والعمولة
   * ومستحق التصفية والناولون الداخلي المحمّلين على نفس الفاتورة. البند المجاني بسعر صفر ما
   * يدخلش في الكمية، والفاتورة كلها بسعر صفر وفاتورة الدولار غير المسعّرة من الوكيل ما يتحسبوش.
   */
  private async purchaseCosts(productId: number, fifo?: FifoResult): Promise<{ id: number; date: Date; unit: number }[]> {
    const items = await this.prisma.invoiceItem.findMany({
      where: { productId, qty: { gt: 0 }, invoice: { kind: 'PURCHASE', fake: false } },
      orderBy: [{ invoice: { date: 'desc' } }, { invoiceId: 'desc' }],
      select: { qty: true, price: true, freight: true, tea: true, commission: true, invoice: { select: { id: true, date: true, currency: true } } },
    });
    if (!items.length) return [];
    const byInvoice = new Map<number, { date: Date; currency: string; qty: number; goods: number; extras: number }>();
    for (const it of items) {
      const g = byInvoice.get(it.invoice.id) ?? { date: it.invoice.date, currency: it.invoice.currency, qty: 0, goods: 0, extras: 0 };
      if (it.price > 0) g.qty += it.qty;
      g.goods += it.qty * it.price;
      g.extras += (it.freight || 0) + (it.tea || 0) + (it.commission || 0);
      byInvoice.set(it.invoice.id, g);
    }
    const [dues, linked] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { type: 'مستحق تصفية', partnerItem: { is: { productId, invoiceId: { in: [...byInvoice.keys()] } } } },
        select: { credit: true, debit: true, partnerItem: { select: { invoiceId: true } } },
      }),
      this.prisma.transaction.findMany({
        where: { freightProductId: productId, freightInvoiceId: { in: [...byInvoice.keys()] } },
        select: { cashOut: true, cashIn: true, freightInvoiceId: true },
      }),
    ]);
    const added = new Map<number, number>();
    const add = (id: number | null | undefined, v: number) => { if (id != null) added.set(id, (added.get(id) ?? 0) + v); };
    for (const t of dues) add(t.partnerItem?.invoiceId, (t.credit || 0) - (t.debit || 0));
    for (const t of linked) add(t.freightInvoiceId, (t.cashOut || 0) - (t.cashIn || 0));

    const out: { id: number; date: Date; unit: number }[] = [];
    for (const [id, g] of byInvoice) {
      if (g.qty <= 0) continue;
      let rate = 1;
      if (g.currency === 'USD') {
        fifo ??= await this.usdFifo();
        const f = fifo.byInvoice.get(id);
        if (!f || f.usd <= 0 || f.pricedUsd <= 0) continue;
        rate = f.rate;
      }
      out.push({ id, date: g.date, unit: (g.goods * rate + g.extras + (added.get(id) ?? 0)) / g.qty });
    }
    return out;
  }

  /**
   * تكلفة وحدة الصنف الحالية = متوسط سعر الشراء المرجّح بالكمية للرصيد الموجود.
   * صنف مالوش أي فاتورة شراء مسعّرة: سعر التقييم اليدوي لو متكتب، وإلا صفر.
   */
  async unitCost(productId: number, fifo?: FifoResult): Promise<number> {
    const { avg } = await this.saleCosting(productId, fifo);
    if (avg != null) return avg;
    const p = await this.prisma.product.findUnique({ where: { id: productId }, select: { price: true } });
    return p?.price && p.price > 0 ? p.price : 0;
  }

  /**
   * تكلفة بيعات الصنف بالمتوسط المرجّح المتحرّك: كل فاتورة شراء بتدخل على الرصيد الموجود
   * (الرصيد × المتوسط + الكمية × تكلفة الفاتورة) ÷ الرصيد الجديد، والبيعة بتاخد المتوسط
   * وقت البيع — شراء بعدها ما يغيّرهاش. 50 بـ 35 + 105 بـ 40 + 30 بـ 45 → 39.46.
   * الكمية اللي اتباعت من غير رصيد تكلفتها أول شراء بعدها، ولو لسه ما اتشرتش تبقى
   * pendingQty وبره التقارير لحد الشراء. نفس اليوم: الوارد يتحسب قبل المنصرف.
   * المرتجع والتسوية والإعارة بيغيّروا الكمية بس، والمتوسط زي ما هو.
   */
  async saleCosting(productId: number, fifo?: FifoResult) {
    const costs = await this.purchaseCosts(productId, fifo);
    const unitOf = new Map(costs.map((c) => [c.id, c.unit]));
    // costs من الأحدث للأقدم → أول شراء مسعّر بعد تاريخ معيّن.
    const firstAfter = (d: Date) => {
      let found: number | null = null;
      for (const c of costs) { if (c.date > d) found = c.unit; else break; }
      return found;
    };

    const [items, returns, adjustments, loans] = await Promise.all([
      this.prisma.invoiceItem.findMany({
        where: { productId, invoice: { fake: false } },
        select: { id: true, qty: true, price: true, invoice: { select: { id: true, kind: true, date: true } } },
      }),
      this.prisma.returnItem.findMany({
        where: { productId },
        select: { qty: true, return: { select: { kind: true, date: true } } },
      }),
      this.prisma.adjustment.findMany({ where: { productId }, select: { qty: true, date: true } }),
      this.prisma.loan.findMany({ where: { productId }, select: { qty: true, returnedQty: true, date: true } }),
    ]);
    const events: { at: Date; qty: number; saleItemId?: number; purchaseInvoiceId?: number; free?: boolean }[] = [];
    for (const it of items) {
      if (it.invoice.kind === 'PURCHASE') events.push({ at: it.invoice.date, qty: it.qty, purchaseInvoiceId: it.invoice.id, free: !(it.price > 0) });
      else events.push({ at: it.invoice.date, qty: -it.qty, saleItemId: it.id });
    }
    for (const it of returns) events.push({ at: it.return.date, qty: it.return.kind === 'SALE' ? it.qty : -it.qty });
    for (const a of adjustments) events.push({ at: a.date, qty: a.qty });
    for (const l of loans) events.push({ at: l.date, qty: (l.returnedQty ?? 0) - l.qty });
    events.sort((a, b) => a.at.getTime() - b.at.getTime() || b.qty - a.qty);

    const lines = new Map<number, { qty: number; cost: number; pendingQty: number }>();
    // المتوسط بعد كل حركة — costAt(تاريخ) للمرتجعات في التقارير.
    const history: { at: Date; avg: number | null }[] = [];
    let stock = 0;
    let avg: number | null = null;
    for (const e of events) {
      if (e.saleItemId != null) {
        const sold = -e.qty;
        const covered = Math.max(0, Math.min(sold, stock));
        const short = sold - covered;
        const coveredUnit = avg ?? firstAfter(e.at);
        const shortUnit = firstAfter(e.at);
        lines.set(e.saleItemId, {
          qty: (coveredUnit == null ? 0 : covered) + (shortUnit == null ? 0 : short),
          cost: covered * (coveredUnit ?? 0) + short * (shortUnit ?? 0),
          pendingQty: (coveredUnit == null ? covered : 0) + (shortUnit == null ? short : 0),
        });
      } else if (e.purchaseInvoiceId != null && e.qty > 0) {
        // فاتورة دولار لسه ما اتسعّرتش من الوكيل: بتدخل بالمتوسط الحالي لحد التسعير.
        // البند المجاني بيزوّد الكمية بتكلفة صفر (تكلفة الفاتورة كلها على البنود المسعّرة).
        const unit = e.free ? 0 : unitOf.get(e.purchaseInvoiceId) ?? avg;
        if (unit != null) avg = stock > 0 && avg != null ? (stock * avg + e.qty * unit) / (stock + e.qty) : unit;
      }
      stock += e.qty;
      history.push({ at: e.at, avg });
    }
    const costAt = (d: Date) => {
      let v: number | null = null;
      for (const h of history) { if (h.at <= d) v = h.avg; else break; }
      return v ?? firstAfter(d);
    };
    return { lines, costAt, avg };
  }

  async warehouseStock(warehouseId: number) {
    const products = await this.prisma.product.findMany({ where: { service: false } });
    const fifo = await this.usdFifo();
    const rows = await Promise.all(
      products.map(async (p) => {
        const qty = await this.stockOf(p.id, warehouseId);
        // متوسط سعر الشراء المرجّح؛ سعر التقييم اليدوي بس للصنف اللي مالوش فواتير شراء.
        const cost = await this.unitCost(p.id, fifo);
        // سعر الشراء/البيع الثابت بيتبعت مع الرصيد عشان يتعرض ويتعدّل من شاشة
        // المخازن على طول — هما نفسهم اللي بيتحطّوا تلقائيًا في سطر الفاتورة.
        return {
          productId: p.uid, name: p.name, unit: p.unit, qty, cost, value: qty * cost,
          purchasePrice: p.purchasePrice, salePrice: p.salePrice,
        };
      }),
    );
    return rows;
  }

  async warehouseValue(warehouseId: number): Promise<number> {
    const rows = await this.warehouseStock(warehouseId);
    return rows.reduce((s, r) => s + r.value, 0);
  }

  async totalInventoryValue(): Promise<number> {
    const whs = await this.prisma.warehouse.findMany();
    let total = 0;
    for (const w of whs) total += await this.warehouseValue(w.id);
    return total;
  }
}
