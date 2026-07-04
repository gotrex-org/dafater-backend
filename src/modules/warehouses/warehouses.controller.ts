import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { WarehouseDto } from './dto/warehouses.dto';
import { WarehousesService } from './warehouses.service';

@Controller('warehouses')
@Permissions('inventory', 'invoices', 'settings')
export class WarehousesController {
  constructor(private service: WarehousesService) {}

  @Get()
  findAll(@Query() q: PaginationQueryDto) {
    return this.service.findAll(q);
  }

  @Get(':id/stock')
  stock(@Param('id') id: string) {
    return this.service.stock(id);
  }

  @Post()
  @Permissions('settings', 'inventory.addWarehouse')
  create(@Body() dto: WarehouseDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Permissions('settings')
  update(@Param('id') id: string, @Body() dto: WarehouseDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions('settings')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
