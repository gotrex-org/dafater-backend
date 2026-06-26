import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { CreateProductDto, UpdateProductDto } from './dto/products.dto';

@Injectable()
export class ProductsRepository {
  constructor(private prisma: PrismaService) {}

  catalog() {
    return this.prisma.product.findMany({
      select: { uid: true, name: true, unit: true },
      orderBy: { name: 'asc' },
    });
  }

  findAll(q: PaginationQueryDto) {
    return paginate(this.prisma.product, q, {
      where: q.search ? { name: { contains: q.search, mode: 'insensitive' as const } } : {},
      orderBy: { name: 'asc' },
    });
  }

  findOne(id: string) {
    return this.prisma.product.findUnique({ where: { uid: id } });
  }

  async movements(uid: string) {
    const product = await this.prisma.product.findUnique({ where: { uid }, select: { id: true } });
    if (!product) return [];
    const [items, dealItems] = await Promise.all([
      this.prisma.invoiceItem.findMany({
        where: { productId: product.id },
        include: { invoice: { include: { party: true, warehouse: true } } },
      }),
      this.prisma.dealItem.findMany({
        where: { productId: product.id },
        include: { deal: { include: { supplier: true, client: true } } },
      }),
    ]);
    return { items, dealItems };
  }

  create(dto: CreateProductDto) {
    return this.prisma.product.create({ data: dto });
  }

  update(id: string, dto: UpdateProductDto) {
    return this.prisma.product.update({ where: { uid: id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.product.delete({ where: { uid: id } });
  }
}
