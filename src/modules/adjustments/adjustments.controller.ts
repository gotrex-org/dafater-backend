import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateAdjustmentDto } from './dto/adjustments.dto';
import { AdjustmentsService } from './adjustments.service';

@Controller('adjustments')
@Permissions('inventory')
export class AdjustmentsController {
  constructor(private service: AdjustmentsService) {}

  @Get()
  findAll(@Query() q: PaginationQueryDto, @Query('warehouseId') warehouseId?: string) {
    return this.service.findAll(q, warehouseId);
  }

  @Post()
  create(@Body() dto: CreateAdjustmentDto) {
    return this.service.create(dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
