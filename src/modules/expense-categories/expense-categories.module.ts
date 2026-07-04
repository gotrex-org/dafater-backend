import { Module } from '@nestjs/common';
import { ExpenseCategoriesRepository } from './expense-categories.repository';
import { ExpenseCategoriesService } from './expense-categories.service';
import { ExpenseCategoriesController } from './expense-categories.controller';

@Module({ providers: [ExpenseCategoriesRepository, ExpenseCategoriesService], controllers: [ExpenseCategoriesController] })
export class ExpenseCategoriesModule {}
