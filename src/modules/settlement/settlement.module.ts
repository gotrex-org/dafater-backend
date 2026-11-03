import { Module } from '@nestjs/common';
import { SettlementController } from './settlement.controller';
import { SettlementRepository } from './settlement.repository';
import { SettlementItemsRepository } from './settlement-items.repository';
import { SettlementLedgerRepository } from './settlement-ledger.repository';
import { SettlementService } from './settlement.service';

@Module({
  providers: [SettlementRepository, SettlementItemsRepository, SettlementLedgerRepository, SettlementService],
  exports: [SettlementService],
  controllers: [SettlementController],
})
export class SettlementModule {}
