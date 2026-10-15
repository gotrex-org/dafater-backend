import { Module } from '@nestjs/common';
import { SettlementController } from './settlement.controller';
import { SettlementRepository } from './settlement.repository';
import { SettlementService } from './settlement.service';

@Module({
  providers: [SettlementRepository, SettlementService],
  controllers: [SettlementController],
})
export class SettlementModule {}
