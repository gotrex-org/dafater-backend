import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { CategoryDto } from './dto/expense-categories.dto';

@Injectable()
export class ExpenseCategoriesRepository {
  constructor(private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto) {
    return paginate(this.prisma.expenseCategory, q, { orderBy: { name: 'asc' } });
  }

  create(dto: CategoryDto) {
    return this.prisma.expenseCategory.create({ data: dto });
  }

  update(id: string, dto: CategoryDto) {
    return this.prisma.expenseCategory.update({ where: { uid: id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.expenseCategory.delete({ where: { uid: id } });
  }
}
