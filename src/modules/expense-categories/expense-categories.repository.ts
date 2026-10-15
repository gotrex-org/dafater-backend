import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { CategoryDto } from './dto/expense-categories.dto';

@Injectable()
export class ExpenseCategoriesRepository {
  constructor(private prisma: PrismaService) {}

  // المؤرشفة مابتظهرش في القوايم والاختيارات — الحركات القديمة بتفضل شايلة اسمها.
  findAll(q: PaginationQueryDto) {
    return paginate(this.prisma.expenseCategory, q, { where: { hidden: false }, orderBy: { name: 'asc' } });
  }

  findByName(name: string) {
    return this.prisma.expenseCategory.findFirst({ where: { name } });
  }

  create(dto: CategoryDto) {
    return this.prisma.expenseCategory.create({ data: dto });
  }

  update(id: string, dto: CategoryDto) {
    return this.prisma.expenseCategory.update({ where: { uid: id }, data: dto });
  }

  restore(id: number, dto: CategoryDto) {
    return this.prisma.expenseCategory.update({ where: { id }, data: { ...dto, hidden: false } });
  }

  async usage(uid: string) {
    const c = await this.prisma.expenseCategory.findUnique({
      where: { uid },
      select: { id: true, _count: { select: { transactions: true, expenseSchedules: true } } },
    });
    return c ? { id: c.id, used: c._count.transactions + c._count.expenseSchedules > 0 } : null;
  }

  archive(id: number) {
    return this.prisma.expenseCategory.update({ where: { id }, data: { hidden: true } });
  }

  remove(id: string) {
    return this.prisma.expenseCategory.delete({ where: { uid: id } });
  }
}
