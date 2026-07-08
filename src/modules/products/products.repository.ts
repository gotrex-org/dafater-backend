import { Injectable } from '@nestjs/common';
import { InvoiceKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { CreateProductDto, UpdateProductDto } from './dto/products.dto';

@Injectable()
export class ProductsRepository {
  constructor(private prisma: PrismaService) {}

  catalog() {
    return this.prisma.product.findMany({
      select: { uid: true, name: true, unit: true, service: true },
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

  // Most recent invoice-item price per product, for a given invoice kind — shown as
  // a hint under the price field while creating a new invoice of that kind.
  async lastPrices(kind: InvoiceKind) {
    const items = await this.prisma.invoiceItem.findMany({
      where: { invoice: { kind } },
      select: { price: true, product: { select: { uid: true } }, invoice: { select: { date: true } } },
      orderBy: [{ invoice: { date: 'desc' } }, { id: 'desc' }],
    });
    const byProduct = new Map<string, { price: number; date: Date }>();
    for (const it of items) {
      if (!byProduct.has(it.product.uid)) byProduct.set(it.product.uid, { price: it.price, date: it.invoice.date });
    }
    return Array.from(byProduct, ([productId, v]) => ({ productId, price: v.price, date: v.date }));
  }

  create(dto: CreateProductDto) {
    return this.prisma.product.create({ data: dto });
  }

  update(id: string, dto: UpdateProductDto) {
    return this.prisma.product.update({ where: { uid: id }, data: dto });
  }

  findByUid(id: string) {
    return this.prisma.product.findUnique({ where: { uid: id }, select: { id: true } });
  }

  async countHardBlockers(id: number) {
    // Real sales/purchase history — never touched by cascade, deleting the product
    // would mean silently deleting other parties' invoices/deals.
    const [invoiceItems, dealItems] = await Promise.all([
      this.prisma.invoiceItem.count({ where: { productId: id } }),
      this.prisma.dealItem.count({ where: { productId: id } }),
    ]);
    return invoiceItems + dealItems;
  }

  async countCascadeEligible(id: number) {
    const [adjustments, loans] = await Promise.all([
      this.prisma.adjustment.count({ where: { productId: id } }),
      this.prisma.loan.count({ where: { productId: id } }),
    ]);
    return adjustments + loans;
  }

  async removeCascade(id: number) {
    await this.prisma.adjustment.deleteMany({ where: { productId: id } });
    // LoanReturn rows cascade with their Loan (onDelete: Cascade on loanId).
    await this.prisma.loan.deleteMany({ where: { productId: id } });
    return this.prisma.product.delete({ where: { id } });
  }
}
