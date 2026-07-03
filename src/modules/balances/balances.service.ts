import { Injectable } from '@nestjs/common';
import { BalancesRepository } from './balances.repository';

@Injectable()
export class BalancesService {
  constructor(private repo: BalancesRepository) {}

  partyBalance(partyId: number) { return this.repo.partyBalance(partyId); }
  partyBalanceMulti(partyIds: number[]) { return this.repo.partyBalanceMulti(partyIds); }
  allPartyBalances() { return this.repo.allPartyBalances(); }
  treasuryBalance(treasuryId: number) { return this.repo.treasuryBalance(treasuryId); }
  allTreasuryBalances() { return this.repo.allTreasuryBalances(); }
  stockOf(productId: number, warehouseId: number) { return this.repo.stockOf(productId, warehouseId); }
  avgCost(productId: number) { return this.repo.avgCost(productId); }
  warehouseStock(warehouseId: number) { return this.repo.warehouseStock(warehouseId); }
  warehouseValue(warehouseId: number) { return this.repo.warehouseValue(warehouseId); }
  totalInventoryValue() { return this.repo.totalInventoryValue(); }
}
