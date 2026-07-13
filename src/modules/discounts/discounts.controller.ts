import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateDiscountDto, CreateDiscountScheduleDto } from './dto/discounts.dto';
import { DiscountsService } from './discounts.service';

// Discounts live under the invoices permission — a section within الفواتير.
@Controller('discounts')
@Permissions('invoices')
export class DiscountsController {
  constructor(private service: DiscountsService) {}

  @Get()
  findAll(@Query() q: PaginationQueryDto) {
    return this.service.findAll(q);
  }

  @Get('schedules')
  listSchedules() {
    return this.service.listSchedules();
  }

  @Post('schedules')
  createSchedule(@Body() dto: CreateDiscountScheduleDto) {
    return this.service.createSchedule(dto);
  }

  @Delete('schedules/:id')
  @Permissions('invoices.delete')
  removeSchedule(@Param('id') id: string) {
    return this.service.removeSchedule(id);
  }

  @Post()
  create(@Body() dto: CreateDiscountDto, @CurrentUser() user: any) {
    return this.service.create(dto, user?.intId);
  }

  @Delete(':id')
  @Permissions('invoices.delete')
  remove(@Param('id') id: string, @Query('cascade') cascade?: string) {
    return this.service.remove(id, cascade === 'true');
  }
}
