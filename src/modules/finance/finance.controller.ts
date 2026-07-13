import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PrimaryGuard } from '../../auth/guards/primary.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateOwnerEntryDto, UpdateOwnerEntryDto } from './dto/finance.dto';
import { FinanceService } from './finance.service';

// Private to the owner (primary) account only, and scoped to their own entries.
@Controller('finance')
@UseGuards(PrimaryGuard)
export class FinanceController {
  constructor(private service: FinanceService) {}

  @Get()
  findAll(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.findAll(user.intId, from, to);
  }

  @Post()
  create(@Body() dto: CreateOwnerEntryDto, @CurrentUser() user: any) {
    return this.service.create(user.intId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOwnerEntryDto, @CurrentUser() user: any) {
    return this.service.update(id, user.intId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user.intId);
  }
}
