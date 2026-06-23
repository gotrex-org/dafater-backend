import { Module } from '@nestjs/common';
import { TreasuryService } from './treasury.service';
import { TreasuryController } from './treasury.controller';

@Module({ providers: [TreasuryService], controllers: [TreasuryController] })
export class TreasuryModule {}
