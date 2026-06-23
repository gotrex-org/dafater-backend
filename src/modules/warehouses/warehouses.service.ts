import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BalancesService } from '../balances/balances.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { WarehouseDto } from './dto/warehouses.dto';

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
