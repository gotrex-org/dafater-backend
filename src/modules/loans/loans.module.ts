import { Module } from '@nestjs/common';
import { LoansRepository } from './loans.repository';
import { LoansService } from './loans.service';
import { LoansController } from './loans.controller';

@Module({ providers: [LoansRepository, LoansService], controllers: [LoansController] })
export class LoansModule {}
