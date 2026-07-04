import { Injectable } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CategoryDto } from './dto/expense-categories.dto';
import { ExpenseCategoriesRepository } from './expense-categories.repository';

@Injectable()
export class ExpenseCategoriesService {
  constructor(private repo: ExpenseCategoriesRepository) {}

  findAll(q: PaginationQueryDto) { return this.repo.findAll(q); }
  create(dto: CategoryDto) { return this.repo.create(dto); }
  update(id: string, dto: CategoryDto) { return this.repo.update(id, dto); }
  remove(id: string) { return this.repo.remove(id); }
}
