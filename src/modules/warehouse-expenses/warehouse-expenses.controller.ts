import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PrimaryGuard } from '../../auth/guards/primary.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateWarehouseScheduleDto, PayDueDto } from './dto/warehouse-expenses.dto';
import { WarehouseExpensesService } from './warehouse-expenses.service';

@Controller('warehouse-expenses')
export class WarehouseExpensesController {
  constructor(private service: WarehouseExpensesService) {}

  // بنود المخزن الثابتة — إدارتها لصاحب الحساب فقط.
  @Get('schedules')
  @UseGuards(PrimaryGuard)
  listSchedules() {
    return this.service.listSchedules();
  }

  @Post('schedules')
  @UseGuards(PrimaryGuard)
  createSchedule(@Body() dto: CreateWarehouseScheduleDto) {
    return this.service.createSchedule(dto);
  }

  @Delete('schedules/:id')
  @UseGuards(PrimaryGuard)
  removeSchedule(@Param('id') id: string) {
    return this.service.removeSchedule(id);
  }

  // الاستحقاقات المستحقة — تظهر في التذكيرات؛ أي مستخدم عنده صلاحية المصاريف يقدر يتأكّد عليها.
  @Get('dues')
  @Permissions('entry.expense')
  listDues() {
    return this.service.listDues();
  }

  @Get('dues/count')
  @Permissions('entry.expense')
  dueCount() {
    return this.service.dueCount();
  }

  @Post('dues/:id/pay')
  @Permissions('entry.expense')
  payDue(@Param('id') id: string, @Body() dto: PayDueDto, @CurrentUser() user: any) {
    return this.service.payDue(id, dto.treasuryId, user?.intId);
  }
}
