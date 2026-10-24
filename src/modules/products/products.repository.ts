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
      where: { hidden: false },
      select: { uid: true, name: true, unit: true, service: true },
      orderBy: { name: 'asc' },
    });
  }

  findAll(q: PaginationQueryDto) {
    return paginate(this.prisma.product, q, {
      where: {
        hidden: false,
        ...(q.search ? { name: { contains: q.search, mode: 'insensitive' as const } } : {}),
      },
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
    return this.prisma.product.findUnique({ where: { uid: id }, select: { id: true, name: true } });
  }

  /** الأرشفة — الطريق الوحيد لـ"شيل" صنف مستعمل في فواتير فعلية من غير ما يمسّها. */
  archive(id: number) {
    return this.prisma.product.update({ where: { id }, data: { hidden: true } });
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

  /**
   * دمج أصناف في صنف واحد — ذرّي. كل سطر يشاور على صنف مدموج بيتنقل للصنف الأساسي،
   * والأرصدة مشتقة فبتتجمع لوحدها. الحالات اللي عليها قيد unique:
   *   - قائمة أسعار فيها الصنفين: سعر الأساسي يفضل، وإلا ياخد سعر المدموج.
   *   - فترة صنف على فاتورة فيها الصنفين: فترة الأساسي تفضل.
   * الأسعار الثابتة الفاضية في الأساسي بتتملى من المدموج، والتثبيت في الفواتير بيتجمع.
   */
  merge(targetId: number, sourceIds: number[]) {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.product.findUniqueOrThrow({ where: { id: targetId } });
      const sources = await tx.product.findMany({ where: { id: { in: sourceIds } } });

      for (const item of await tx.supplierPriceListItem.findMany({ where: { productId: { in: sourceIds } } })) {
        const existing = await tx.supplierPriceListItem.findUnique({
          where: { priceListId_productId: { priceListId: item.priceListId, productId: targetId } },
        });
        if (!existing) {
          await tx.supplierPriceListItem.update({ where: { id: item.id }, data: { productId: targetId } });
          continue;
        }
        if (!(existing.price > 0) && item.price > 0) {
          await tx.supplierPriceListItem.update({ where: { id: existing.id }, data: { price: item.price } });
        }
        await tx.supplierPriceListItem.delete({ where: { id: item.id } });
      }

      for (const week of await tx.invoiceItemWeek.findMany({ where: { productId: { in: sourceIds } } })) {
        const existing = await tx.invoiceItemWeek.findUnique({
          where: { invoiceId_productId: { invoiceId: week.invoiceId, productId: targetId } },
        });
        if (existing) await tx.invoiceItemWeek.delete({ where: { id: week.id } });
        else await tx.invoiceItemWeek.update({ where: { id: week.id }, data: { productId: targetId } });
      }

      const where = { productId: { in: sourceIds } };
      const data = { productId: targetId };
      const items = await tx.invoiceItem.updateMany({ where, data });
      const returns = await tx.returnItem.updateMany({ where, data });
      const deals = await tx.dealItem.updateMany({ where, data });
      const adjustments = await tx.adjustment.updateMany({ where, data });
      const loans = await tx.loan.updateMany({ where, data });

      const firstPositive = (pick: (p: typeof target) => number) =>
        pick(target) > 0 ? pick(target) : sources.map(pick).find((v) => v > 0) ?? pick(target);
      const merged = await tx.product.update({
        where: { id: targetId },
        data: {
          price: firstPositive((p) => p.price),
          purchasePrice: firstPositive((p) => p.purchasePrice),
          salePrice: firstPositive((p) => p.salePrice),
          pinSale: target.pinSale || sources.some((p) => p.pinSale),
          pinPurchase: target.pinPurchase || sources.some((p) => p.pinPurchase),
        },
      });
      await tx.product.deleteMany({ where: { id: { in: sourceIds } } });

      return {
        product: merged,
        merged: sources.map((p) => p.name),
        moved: {
          invoiceItems: items.count, returnItems: returns.count, dealItems: deals.count,
          adjustments: adjustments.count, loans: loans.count,
        },
      };
    }, { timeout: 60000 });
  }

  async removeCascade(id: number) {
    await this.prisma.adjustment.deleteMany({ where: { productId: id } });
    // LoanReturn rows cascade with their Loan (onDelete: Cascade on loanId).
    await this.prisma.loan.deleteMany({ where: { productId: id } });
    return this.prisma.product.delete({ where: { id } });
  }
}
