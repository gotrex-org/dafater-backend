import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { LoansService } from './loans.service';
import { CreateLoanDto, ReturnLoanDto } from './dto/loans.dto';
import { Permissions } from '../../common/decorators/permissions.decorator';

@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Get()
  @Permissions('inventory.loans')
  findAll(@Query('warehouseId') warehouseId?: string, @Query('status') status?: string) {
    return this.loansService.findAll({ warehouseId, status });
  }

  @Post()
  @Permissions('inventory.loans')
  create(@Body() dto: CreateLoanDto) {
    return this.loansService.create(dto);
  }

  @Patch(':id/return')
  @Permissions('inventory.loans')
  returnLoan(@Param('id') id: string, @Body() dto: ReturnLoanDto) {
    return this.loansService.returnLoan(id, dto);
  }

  @Delete(':id')
  @Permissions('inventory.loans')
  remove(@Param('id') id: string) {
    return this.loansService.remove(id);
  }
}
