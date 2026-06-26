import { Global, Module } from '@nestjs/common';
import { BalancesRepository } from './balances.repository';
import { BalancesService } from './balances.service';

@Global()
@Module({
  providers: [BalancesRepository, BalancesService],
  exports: [BalancesService],
})
export class BalancesModule {}
