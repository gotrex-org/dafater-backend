import { Module } from '@nestjs/common';
import { ExpenseCategoriesService } from './expense-categories.service';
import { ExpenseCategoriesController } from './expense-categories.controller';

@Module({ providers: [ExpenseCategoriesService], controllers: [ExpenseCategoriesController] })
export class ExpenseCategoriesModule {}
