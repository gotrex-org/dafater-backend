import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { CreateProductDto, UpdateProductDto } from './dto/products.dto';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}
  findAll(q: PaginationQueryDto) {
    return paginate(this.prisma.product, q, {
      where: q.search ? { name: { contains: q.search, mode: 'insensitive' as const } } : {},
      orderBy: { name: 'asc' },
    });
  }
  findOne(id: string) {
    return this.prisma.product.findUnique({ where: { uid: id } });
  }
  /** in/out movements of a product across invoices: where it came from / went to. */
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
    const rows = [
      // invoices: PURCHASE = جاء من مورد · SALE = خرج لعميل
      ...items.map((it) => ({
        id: it.uid, date: it.invoice.date, kind: it.invoice.kind,
        party: it.invoice.party?.name ?? null, warehouse: it.invoice.warehouse?.name ?? null,
        no: it.invoice.no, qty: it.qty, price: it.price,
      })),
      // external deals: came in from the supplier (buy) and went out to the client (sell)
      ...dealItems.flatMap((it) => [
        { id: `${it.uid}-b`, date: it.deal.date, kind: 'PURCHASE' as const, party: it.deal.supplier?.name ?? null, warehouse: 'بيع خارجي', no: it.deal.no, qty: it.qty, price: it.buyPrice },
        { id: `${it.uid}-s`, date: it.deal.date, kind: 'SALE' as const, party: it.deal.client?.name ?? null, warehouse: 'بيع خارجي', no: it.deal.no, qty: it.qty, price: it.price },
      ]),
    ];
    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
