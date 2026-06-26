import { Module } from '@nestjs/common';
import { DealsRepository } from './deals.repository';
import { DealsService } from './deals.service';
import { DealsController } from './deals.controller';

@Module({ providers: [DealsRepository, DealsService], controllers: [DealsController] })
export class DealsModule {}
