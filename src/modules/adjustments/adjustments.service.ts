import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/pagination';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateAdjustmentDto } from './dto/adjustments.dto';

@Injectable()
export class AdjustmentsService {
  constructor(private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto, warehouseId?: string) {
    // warehouseId query param is the public uid -> filter via the relation
    return paginate(this.prisma.adjustment, q, {
      where: warehouseId ? { warehouse: { uid: warehouseId } } : {},
      orderBy: { date: 'desc' },
      include: { product: true, warehouse: true },
    });
  }

  create(dto: CreateAdjustmentDto) {
    const { warehouseId, productId, date, ...rest } = dto;
    return this.prisma.adjustment.create({
      data: {
        ...rest,
        date: new Date(date),
        warehouse: { connect: { uid: warehouseId } },
        product: { connect: { uid: productId } },
      },
    });
  }

  remove(id: string) {
    return this.prisma.adjustment.delete({ where: { uid: id } });
  }
}
