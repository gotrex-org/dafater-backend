import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { BalancesModule } from './modules/balances/balances.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';

import { UsersModule } from './modules/users/users.module';
import { PartiesModule } from './modules/parties/parties.module';
import { ProductsModule } from './modules/products/products.module';
import { WarehousesModule } from './modules/warehouses/warehouses.module';
import { ExpenseCategoriesModule } from './modules/expense-categories/expense-categories.module';
import { TreasuryModule } from './modules/treasury/treasury.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { DealsModule } from './modules/deals/deals.module';
import { AdjustmentsModule } from './modules/adjustments/adjustments.module';
import { RequestsModule } from './modules/requests/requests.module';
import { ManifestsModule } from './modules/manifests/manifests.module';
import { OrdersModule } from './modules/orders/orders.module';
import { AppConfigModule } from './modules/config/config.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AuditModule } from './modules/audit/audit.module';
import { ForexModule } from './modules/forex/forex.module';
import { LoansModule } from './modules/loans/loans.module';
import { DriverTripsModule } from './modules/driver-trips/driver-trips.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { ReportsModule } from './modules/reports/reports.module';
import { FinanceModule } from './modules/finance/finance.module';
import { DiscountsModule } from './modules/discounts/discounts.module';
import { WarehouseExpensesModule } from './modules/warehouse-expenses/warehouse-expenses.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Rate limiting: global default of 120 requests / minute per client IP.
    // Stricter per-route limits are applied with @Throttle (e.g. login).
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: Number(process.env.THROTTLE_TTL) || 60_000,
        limit: Number(process.env.THROTTLE_LIMIT) || 120,
      },
    ]),
    PrismaModule,
    BalancesModule,
    AuthModule,
    // feature modules
    UsersModule,
    PartiesModule,
    ProductsModule,
    WarehousesModule,
    ExpenseCategoriesModule,
    TreasuryModule,
    InvoicesModule,
    TransactionsModule,
    DealsModule,
    AdjustmentsModule,
    RequestsModule,
    ManifestsModule,
    OrdersModule,
    AppConfigModule,
    DashboardModule,
    AuditModule,
    ForexModule,
    LoansModule,
    DriverTripsModule,
    DriversModule,
    ReturnsModule,
    RemindersModule,
    ReportsModule,
    FinanceModule,
    DiscountsModule,
    WarehouseExpensesModule,
  ],
  providers: [
    // Rate limit first, then JWT (authenticate), then RBAC (authorize)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
