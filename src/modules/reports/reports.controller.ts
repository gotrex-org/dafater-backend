import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InvoiceKind } from '@prisma/client';
import { PrimaryGuard } from '../../auth/guards/primary.guard';
import { ReportsService } from './reports.service';

// Reports are private to the owner (primary) account only.
@Controller('reports')
@UseGuards(PrimaryGuard)
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Get('top-products')
  topProducts(@Query('from') from?: string, @Query('to') to?: string, @Query('limit') limit?: string) {
    return this.service.topProducts(from, to, limit ? Number(limit) : 20);
  }

  @Get('top-clients')
  topClients(@Query('from') from?: string, @Query('to') to?: string, @Query('limit') limit?: string) {
    return this.service.topParties(InvoiceKind.SALE, from, to, limit ? Number(limit) : 20);
  }

  @Get('top-suppliers')
  topSuppliers(@Query('from') from?: string, @Query('to') to?: string, @Query('limit') limit?: string) {
    return this.service.topParties(InvoiceKind.PURCHASE, from, to, limit ? Number(limit) : 20);
  }

  @Get('busiest')
  busiest(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.busiest(from, to);
  }

  @Get('summary')
  summary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.summary(from, to);
  }

  @Get('inactive-clients')
  inactiveClients(@Query('days') days?: string) {
    return this.service.inactiveClients(days ? Number(days) : 45);
  }

  @Get('profit-loss')
  profitLoss(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.profitLoss(from, to);
  }

  @Get('warehouse-expenses')
  warehouseExpenses(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.warehouseExpenses(from, to);
  }

  @Get('custody-balances')
  custodyBalances() {
    return this.service.custodyBalances();
  }
}
