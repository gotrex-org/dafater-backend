import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { WarehouseDto } from './dto/warehouses.dto';

@Injectable()
export class WarehousesRepository {
  constructor(private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto) {
    return paginate(this.prisma.warehouse, q, { orderBy: { name: 'asc' } });
  }

  findByUid(uid: string) {
    return this.prisma.warehouse.findUnique({ where: { uid }, select: { id: true } });
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
