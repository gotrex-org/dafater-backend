import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateDealDto } from './dto/deals.dto';
import { DealsService } from './deals.service';

@Controller('deals')
@Permissions('deals')
export class DealsController {
  constructor(private service: DealsService) {}

  @Get()
  findAll(@Query() q: PaginationQueryDto) {
    return this.service.findAll(q);
  }

  @Post()
  create(@Body() dto: CreateDealDto) {
    return this.service.create(dto);
  }

  @Delete(':id')
  @Permissions('deals.delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
