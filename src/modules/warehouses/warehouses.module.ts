import { Module } from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { WarehousesController } from './warehouses.controller';

@Module({ providers: [WarehousesService], controllers: [WarehousesController] })
export class WarehousesModule {}
