import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { BalancesService } from '../balances/balances.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { Permissions } from '../../common/decorators/permissions.decorator';

export class WarehouseDto {
  @IsString() name: string;
}

@Injectable()
export class WarehousesService {
  constructor(
    private prisma: PrismaService,
    private balances: BalancesService,
  ) {}
  findAll(q: PaginationQueryDto) {
    return paginate(this.prisma.warehouse, q, { orderBy: { name: 'asc' } });
  }
  async stock(id: string) {
    const wh = await this.prisma.warehouse.findUnique({ where: { uid: id }, select: { id: true } });
    if (!wh) return [];
    return this.balances.warehouseStock(wh.id);
  }
  create(dto: WarehouseDto) {
    return this.prisma.warehouse.create({ data: dto });
  }
  update(id: string, dto: WarehouseDto) {
    return this.prisma.warehouse.update({ where: { uid: id }, data: dto });
  }
  remove(id: string) {
    return this.prisma.warehouse.delete({ where: { uid: id } });
  }
}

@Controller('warehouses')
@Permissions('inventory', 'invoices', 'settings')
export class WarehousesController {
  constructor(private service: WarehousesService) {}
  @Get() findAll(@Query() q: PaginationQueryDto) {
    return this.service.findAll(q);
  }
  @Get(':id/stock') stock(@Param('id') id: string) {
    return this.service.stock(id);
  }
  @Post() @Permissions('settings', 'inventory.addWarehouse') create(@Body() dto: WarehouseDto) {
    return this.service.create(dto);
  }
  @Patch(':id') @Permissions('settings') update(@Param('id') id: string, @Body() dto: WarehouseDto) {
    return this.service.update(id, dto);
  }
  @Delete(':id') @Permissions('settings') remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({ providers: [WarehousesService], controllers: [WarehousesController] })
export class WarehousesModule {}
