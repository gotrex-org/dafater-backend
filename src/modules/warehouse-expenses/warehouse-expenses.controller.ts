import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PrimaryGuard } from '../../auth/guards/primary.guard';
import { CreateWarehouseScheduleDto } from './dto/warehouse-expenses.dto';
import { WarehouseExpensesService } from './warehouse-expenses.service';

// بنود المخزن الثابتة (إيجار/مرتبات...) — خاصة بصاحب الحساب فقط.
@Controller('warehouse-expenses')
@UseGuards(PrimaryGuard)
export class WarehouseExpensesController {
  constructor(private service: WarehouseExpensesService) {}

  @Get('schedules')
  listSchedules() {
    return this.service.listSchedules();
  }

  @Post('schedules')
  createSchedule(@Body() dto: CreateWarehouseScheduleDto) {
    return this.service.createSchedule(dto);
  }

  @Delete('schedules/:id')
  removeSchedule(@Param('id') id: string) {
    return this.service.removeSchedule(id);
  }
}
