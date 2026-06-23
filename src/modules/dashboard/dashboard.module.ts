import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BalancesService } from '../balances/balances.service';
import { Permissions } from '../../common/decorators/permissions.decorator';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private balances: BalancesService,
  ) {}

  async stats() {
    const parties = await this.prisma.party.findMany();
    const balById = await this.balances.allPartyBalances();

    let receivable = 0;
    let payable = 0;
    const top: { id: string; name: string; role: string; balance: number }[] = [];
    for (const p of parties) {
      const bal = balById[p.id] ?? p.opening;
      if (p.role === 'CLIENT' && bal > 0) receivable += bal;
      if (p.role === 'SUPPLIER' && bal < 0) payable += -bal;
      top.push({ id: p.uid, name: p.name, role: p.role, balance: bal });
    }
    top.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

    const treasury = await this.balances.allTreasuryBalances();
    const cashByCurrency = treasury.reduce(
      (acc, t) => {
        acc[t.currency] = (acc[t.currency] || 0) + t.balance;
        return acc;
      },
      {} as Record<string, number>,
    );

    const warehouses = await this.prisma.warehouse.findMany();
    const warehouseValues = await Promise.all(
      warehouses.map(async (w) => ({
        id: w.uid, name: w.name, value: await this.balances.warehouseValue(w.id),
      })),
    );
    const inventoryValue = warehouseValues.reduce((s, w) => s + w.value, 0);

    return {
      receivable,
      payable,
      cashByCurrency,
      inventoryValue,
      treasury,
      warehouses: warehouseValues,
      topBalances: top.slice(0, 10),
      counts: {
        clients: parties.filter((p) => p.role === 'CLIENT').length,
        suppliers: parties.filter((p) => p.role === 'SUPPLIER').length,
        products: await this.prisma.product.count(),
        invoices: await this.prisma.invoice.count(),
      },
    };
  }
}

@Controller('dashboard')
@Permissions('dash')
export class DashboardController {
  constructor(private service: DashboardService) {}
  @Get() stats() {
    return this.service.stats();
  }
}

@Module({ providers: [DashboardService], controllers: [DashboardController] })
export class DashboardModule {}
