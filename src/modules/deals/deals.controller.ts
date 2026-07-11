import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateDealDto, DealCommissionDto } from './dto/deals.dto';
import { DealsService } from './deals.service';

@Controller('deals')
@Permissions('deals')
export class DealsController {
  constructor(private service: DealsService) {}

  @Get()
  findAll(@Query() q: PaginationQueryDto) {
    return this.service.findAll(q);
  }

  @Get('next-no')
  nextNo(@Query('clientId') clientId: string) {
    return this.service.peekNextNo(clientId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateDealDto, @CurrentUser() user: any) {
    return this.service.create(dto, user?.intId);
  }

  @Patch(':id/commission')
  @Permissions('invoices.commission')
  updateCommission(@Param('id') id: string, @Body() dto: DealCommissionDto) {
    return this.service.updateCommission(id, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreateDealDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user?.intId);
  }

  @Delete(':id')
  @Permissions('deals.delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
