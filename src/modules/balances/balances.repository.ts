import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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

  // Weighted-average EGP-per-USD rate per party, over its rate-carrying (USD-invoice)
  // movements — weighted by the USD amount of each movement. Used by the trial balance
  // to convert a USD party's balance to EGP.
  async avgExchangeRateByParty(): Promise<Record<number, number>> {
    const txns = await this.prisma.transaction.findMany({
      where: { exchangeRate: { gt: 0 }, partyId: { not: null } },
      select: { partyId: true, debit: true, credit: true, exchangeRate: true },
    });
    const acc: Record<number, { w: number; wr: number }> = {};
    for (const t of txns) {
      const w = (t.debit || 0) + (t.credit || 0);
      if (w <= 0 || t.partyId == null) continue;
      if (!acc[t.partyId]) acc[t.partyId] = { w: 0, wr: 0 };
      acc[t.partyId].w += w;
      acc[t.partyId].wr += w * t.exchangeRate;
    }
    const out: Record<number, number> = {};
    for (const [pid, v] of Object.entries(acc)) out[Number(pid)] = v.w > 0 ? v.wr / v.w : 0;
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

  async stockOf(productId: number, warehouseId: number): Promise<number> {
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

  async avgCost(productId: number): Promise<number> {
    const items = await this.prisma.invoiceItem.findMany({
      where: { productId, invoice: { kind: 'PURCHASE', fake: false } },
      select: { qty: true, price: true, freight: true, tea: true, commission: true },
    });
    let totalQty = 0;
    let totalAmt = 0;
    for (const it of items) {
      totalQty += it.qty;
      // Landed cost: goods + freight (ناولون) + tea (شاي) + commission (عمولة) added to the item.
      totalAmt += it.qty * it.price + (it.freight || 0) + (it.tea || 0) + (it.commission || 0);
    }
    return totalQty > 0 ? totalAmt / totalQty : 0;
  }

  async warehouseStock(warehouseId: number) {
    const products = await this.prisma.product.findMany({ where: { service: false } });
    const rows = await Promise.all(
      products.map(async (p) => {
        const qty = await this.stockOf(p.id, warehouseId);
        // A manually-set price (from the product's own settings) overrides the
        // computed weighted-average purchase cost — lets you value stock directly
        // instead of relying on purchase-invoice history (which may not exist yet).
        const cost = p.price > 0 ? p.price : await this.avgCost(p.id);
        return { productId: p.uid, name: p.name, unit: p.unit, qty, cost, value: qty * cost };
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
