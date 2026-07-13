import { Module } from '@nestjs/common';
import { DiscountsRepository } from './discounts.repository';
import { DiscountsService } from './discounts.service';
import { DiscountsController } from './discounts.controller';

@Module({ providers: [DiscountsRepository, DiscountsService], controllers: [DiscountsController] })
export class DiscountsModule {}
