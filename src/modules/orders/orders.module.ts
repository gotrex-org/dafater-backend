import { Module } from '@nestjs/common';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';

@Module({ providers: [OrdersRepository, OrdersService], controllers: [OrdersController] })
export class OrdersModule {}
