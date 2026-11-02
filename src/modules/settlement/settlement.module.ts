import { Module } from '@nestjs/common';
import { SettlementController } from './settlement.controller';
import { SettlementRepository } from './settlement.repository';
import { SettlementItemsRepository } from './settlement-items.repository';
import { SettlementService } from './settlement.service';

@Module({
  providers: [SettlementRepository, SettlementItemsRepository, SettlementService],
  controllers: [SettlementController],
})
export class SettlementModule {}
