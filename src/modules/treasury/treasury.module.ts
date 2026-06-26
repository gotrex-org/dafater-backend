import { Module } from '@nestjs/common';
import { TreasuryRepository } from './treasury.repository';
import { TreasuryService } from './treasury.service';
import { TreasuryController } from './treasury.controller';

@Module({ providers: [TreasuryRepository, TreasuryService], controllers: [TreasuryController] })
export class TreasuryModule {}
