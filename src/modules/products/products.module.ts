import { Module } from '@nestjs/common';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';

@Module({ providers: [ProductsRepository, ProductsService], controllers: [ProductsController] })
export class ProductsModule {}
