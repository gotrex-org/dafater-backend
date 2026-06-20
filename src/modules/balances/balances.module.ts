import { Global, Module } from '@nestjs/common';
import { BalancesService } from './balances.service';

@Global()
@Module({
  providers: [BalancesService],
  exports: [BalancesService],
})
export class BalancesModule {}
