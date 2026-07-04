import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CategoryDto } from './dto/expense-categories.dto';
import { ExpenseCategoriesService } from './expense-categories.service';

@Controller('expense-categories')
@Permissions('entry', 'treasury', 'settings')
export class ExpenseCategoriesController {
  constructor(private service: ExpenseCategoriesService) {}

  @Get()
  findAll(@Query() q: PaginationQueryDto) {
    return this.service.findAll(q);
  }

  @Post()
  @Permissions('settings')
  create(@Body() dto: CategoryDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Permissions('settings')
  update(@Param('id') id: string, @Body() dto: CategoryDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions('settings')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
