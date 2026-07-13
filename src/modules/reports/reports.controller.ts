import { Controller, Get, Query } from '@nestjs/common';
import { InvoiceKind } from '@prisma/client';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { ReportsService } from './reports.service';

@Controller('reports')
@Permissions('reports')
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
}
