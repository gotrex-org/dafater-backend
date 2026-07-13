import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { CreateAdjustmentDto, TransferStockDto } from './dto/adjustments.dto';

@Injectable()
export class AdjustmentsRepository {
  constructor(private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto, warehouseId?: string) {
    return paginate(this.prisma.adjustment, q, {
      where: warehouseId ? { warehouse: { uid: warehouseId } } : {},
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
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

  // A transfer is two paired adjustments per item: −qty from the source, +qty into the
  // destination. Stock is derived from adjustments, so this moves the goods with no ledger.
  async transfer(dto: TransferStockDto) {
    if (dto.fromWarehouseId === dto.toWarehouseId) throw new BadRequestException('اختر مخزنين مختلفين');
    return this.prisma.$transaction(async (tx) => {
      const [from, to] = await Promise.all([
        tx.warehouse.findUniqueOrThrow({ where: { uid: dto.fromWarehouseId }, select: { id: true, name: true } }),
        tx.warehouse.findUniqueOrThrow({ where: { uid: dto.toWarehouseId }, select: { id: true, name: true } }),
      ]);
      const products = await tx.product.findMany({
        where: { uid: { in: dto.items.map((i) => i.productId) } },
        select: { id: true, uid: true },
      });
      const idByUid = new Map(products.map((p) => [p.uid, p.id]));
      const date = new Date(dto.date);
      const note = dto.note?.trim();
      const rows: { date: Date; warehouseId: number; productId: number; qty: number; note: string }[] = [];
      for (const it of dto.items) {
        const pid = idByUid.get(it.productId);
        if (!pid || !(it.qty > 0)) continue;
        rows.push({ date, warehouseId: from.id, productId: pid, qty: -it.qty, note: note || `تحويل إلى ${to.name}` });
        rows.push({ date, warehouseId: to.id, productId: pid, qty: it.qty, note: note || `تحويل من ${from.name}` });
      }
      if (!rows.length) throw new BadRequestException('أضف صنفًا واحدًا على الأقل بكمية صحيحة');
      await tx.adjustment.createMany({ data: rows });
      return { ok: true, items: rows.length / 2 };
    });
  }
}
