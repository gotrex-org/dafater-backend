import { Module } from '@nestjs/common';
import { TransactionsRepository } from './transactions.repository';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';

@Module({ providers: [TransactionsRepository, TransactionsService], controllers: [TransactionsController] })
export class TransactionsModule {}
