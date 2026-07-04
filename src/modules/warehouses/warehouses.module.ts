import { Module } from '@nestjs/common';
import { WarehousesRepository } from './warehouses.repository';
import { WarehousesService } from './warehouses.service';
import { WarehousesController } from './warehouses.controller';

@Module({ providers: [WarehousesRepository, WarehousesService], controllers: [WarehousesController] })
export class WarehousesModule {}
