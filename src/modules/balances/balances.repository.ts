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
    // آخر سعر توريد من أي وكيل — تقريب لمورد بدون أي دفعة بعد.
    const last = await this.prisma.dollarAgentTx.findFirst({
      where: { type: 'USD_OUT', exchangeRate: { gt: 0 } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      select: { exchangeRate: true },
    });
    return computeUsdFifo(
      parties.map((p) => ({ id: p.id, opening: Number(p.opening) || 0 })),
      txs.map((t) => ({
        ...t, partyId: t.partyId!, debit: Number(t.debit) || 0, credit: Number(t.credit) || 0,
        cashIn: Number(t.cashIn) || 0, cashOut: Number(t.cashOut) || 0, exchangeRate: Number(t.exchangeRate) || 0,
      })),
      last?.exchangeRate ?? 0,
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

  async avgCost(productId: number, fifo?: FifoResult): Promise<number> {
    const items = await this.prisma.invoiceItem.findMany({
      where: { productId, invoice: { kind: 'PURCHASE', fake: false } },
      select: { qty: true, price: true, freight: true, tea: true, commission: true, invoice: { select: { id: true, currency: true } } },
    });
    let totalQty = 0;
    let totalAmt = 0;
    for (const it of items) {
      // Landed cost: goods + freight (ناولون) + tea (شاي) + commission (عمولة) added to the item.
      const extras = (it.freight || 0) + (it.tea || 0) + (it.commission || 0);
      if (it.invoice.currency === 'USD') {
        // سعر الصنف بالدولار → جنيه بسعر الدفعات اللي قابلت الفاتورة (FIFO). الجزء غير
        // المسعّر من الفاتورة لا يدخل التكلفة لحد ما الوكيل يورّد.
        fifo ??= await this.usdFifo();
        const f = fifo.byInvoice.get(it.invoice.id);
        if (!f || f.usd <= 0 || f.pricedUsd <= 0) continue;
        const frac = Math.min(1, f.pricedUsd / f.usd);
        totalQty += it.qty * frac;
        totalAmt += it.qty * it.price * frac * f.rate + extras * frac;
        continue;
      }
      totalQty += it.qty;
      totalAmt += it.qty * it.price + extras;
    }
    return totalQty > 0 ? totalAmt / totalQty : 0;
  }

  async warehouseStock(warehouseId: number) {
    const products = await this.prisma.product.findMany({ where: { service: false } });
    const fifo = await this.usdFifo();
    const rows = await Promise.all(
      products.map(async (p) => {
        const qty = await this.stockOf(p.id, warehouseId);
        // A manually-set price (from the product's own settings) overrides the
        // computed weighted-average purchase cost — lets you value stock directly
        // instead of relying on purchase-invoice history (which may not exist yet).
        const cost = p.price > 0 ? p.price : await this.avgCost(p.id, fifo);
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
