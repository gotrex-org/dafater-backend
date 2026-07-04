import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { TreasuryDto } from './dto/treasury.dto';
import { TreasuryService } from './treasury.service';

@Controller('treasury')
@Permissions('treasury', 'entry', 'invoices', 'settings')
export class TreasuryController {
  constructor(private service: TreasuryService) {}

  @Get()
  findAll(@Query() q: PaginationQueryDto) {
    return this.service.findAll(q);
  }

  @Get('movements')
  @Permissions('treasury')
  movements(@Query() q: PaginationQueryDto) {
    return this.service.movements(q);
  }

  @Get('expenses-by-category')
  @Permissions('treasury')
  expenses() {
    return this.service.expensesByCategory();
  }

  @Post()
  @Permissions('settings', 'treasury.add')
  create(@Body() dto: TreasuryDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Permissions('settings')
  update(@Param('id') id: string, @Body() dto: TreasuryDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions('settings')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
