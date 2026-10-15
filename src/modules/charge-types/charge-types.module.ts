import { Module } from '@nestjs/common';
import { ChargeTypesController } from './charge-types.controller';
import { ChargeTypesService } from './charge-types.service';

@Module({ providers: [ChargeTypesService], controllers: [ChargeTypesController] })
export class ChargeTypesModule {}
