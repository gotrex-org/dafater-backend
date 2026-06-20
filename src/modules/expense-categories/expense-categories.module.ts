import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { Permissions } from '../../common/decorators/permissions.decorator';

export class CategoryDto {
  @IsString() name: string;
}

@Injectable()
export class ExpenseCategoriesService {
  constructor(private prisma: PrismaService) {}
  findAll(q: PaginationQueryDto) {
    return paginate(this.prisma.expenseCategory, q, { orderBy: { name: 'asc' } });
  }
  create(dto: CategoryDto) {
    return this.prisma.expenseCategory.create({ data: dto });
  }
  update(id: string, dto: CategoryDto) {
    return this.prisma.expenseCategory.update({ where: { id }, data: dto });
  }
  remove(id: string) {
    return this.prisma.expenseCategory.delete({ where: { id } });
  }
}

@Controller('expense-categories')
@Permissions('entry', 'treasury', 'settings')
export class ExpenseCategoriesController {
  constructor(private service: ExpenseCategoriesService) {}
  @Get() findAll(@Query() q: PaginationQueryDto) {
    return this.service.findAll(q);
  }
  @Post() @Permissions('settings') create(@Body() dto: CategoryDto) {
    return this.service.create(dto);
  }
  @Patch(':id') @Permissions('settings') update(@Param('id') id: string, @Body() dto: CategoryDto) {
    return this.service.update(id, dto);
  }
  @Delete(':id') @Permissions('settings') remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({ providers: [ExpenseCategoriesService], controllers: [ExpenseCategoriesController] })
export class ExpenseCategoriesModule {}
