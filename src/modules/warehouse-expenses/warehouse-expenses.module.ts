import { Module } from '@nestjs/common';
import { WarehouseExpensesRepository } from './warehouse-expenses.repository';
import { WarehouseExpensesService } from './warehouse-expenses.service';
import { WarehouseExpensesController } from './warehouse-expenses.controller';

@Module({ providers: [WarehouseExpensesRepository, WarehouseExpensesService], controllers: [WarehouseExpensesController] })
export class WarehouseExpensesModule {}
