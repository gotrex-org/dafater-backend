import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** تطبيع للبحث: «فريده» تلاقي «فريدة»، و«احمد» تلاقي «أحمد». */
export function normalizeAr(s: string) {
  return (s || '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ً-ْـ]/g, '')
    .trim()
    .toLowerCase();
}

const PURCHASE = { kind: 'PURCHASE' as const, fake: false };

const INVOICE_SELECT = {
  id: true, uid: true, no: true, date: true, currency: true,
  party: { select: { name: true } },
};

/**
 * أصناف التصفية الثابتة (PartnerItem): صنف من فاتورة شراء، مش الفاتورة كلها.
 * أي فاتورة شراء حقيقية تنفع — الاختيار بالصنف نفسه، فمش لازم تكون من مورد الاسم.
 */
@Injectable()
export class SettlementItemsRepository {
  constructor(private prisma: PrismaService) {}

  /** الأصناف المختارة للاسم، ومعاها أسطر الصنف في الفاتورة (الكمية والسعر). */
  selected(partnerId: number) {
    return this.prisma.partnerItem.findMany({
      where: { partnerId },
      include: {
        product: { select: { uid: true, name: true, unit: true } },
        invoice: {
          select: {
            ...INVOICE_SELECT,
            items: { select: { productId: true, qty: true, price: true } },
          },
        },
      },
      orderBy: [{ invoice: { date: 'desc' } }, { invoiceId: 'desc' }, { id: 'asc' }],
    });
  }

  /** أسطر فواتير الشراء (غير الخدمية) في الفترة — البحث بالاسم بيتعمل بعدها. */
  purchaseLines(from?: Date, to?: Date) {
    return this.prisma.invoiceItem.findMany({
      where: {
        product: { service: false },
        invoice: {
          ...PURCHASE,
          ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
        },
      },
      select: {
        qty: true, price: true, productId: true,
        product: { select: { uid: true, name: true, unit: true } },
        invoice: { select: INVOICE_SELECT },
      },
      orderBy: [{ invoice: { date: 'desc' } }, { invoiceId: 'desc' }, { id: 'asc' }],
    });
  }

  marks(partnerId: number, invoiceIds: number[]) {
    return this.prisma.partnerItem.findMany({
      where: { partnerId, invoiceId: { in: invoiceIds } },
      select: { invoiceId: true, productId: true, approved: true },
    });
  }

  /**
   * (فاتورة، صنف) بالـ uid → ids، بعد التأكد إن الفاتورة شراء حقيقية والصنف فيها.
   * القيد هنا لأن الـ API مدخل مستقل عن الشاشة.
   */
  async resolve(pairs: { invoiceId: string; productId: string }[]) {
    const lines = await this.prisma.invoiceItem.findMany({
      where: {
        product: { uid: { in: pairs.map((p) => p.productId) }, service: false },
        invoice: { ...PURCHASE, uid: { in: pairs.map((p) => p.invoiceId) } },
      },
      select: { invoiceId: true, productId: true, invoice: { select: { uid: true } }, product: { select: { uid: true } } },
    });
    const map = new Map(lines.map((l) => [`${l.invoice.uid}:${l.product.uid}`, l]));
    return pairs.map((p) => {
      const l = map.get(`${p.invoiceId}:${p.productId}`);
      if (!l) throw new NotFoundException('الصنف غير موجود في فاتورة الشراء، أو الفاتورة وهمية');
      return { invoiceId: l.invoiceId, productId: l.productId };
    });
  }

  async add(partnerId: number, pairs: { invoiceId: number; productId: number }[], approved: boolean) {
    const { count } = await this.prisma.partnerItem.createMany({
      data: pairs.map((p) => ({ partnerId, ...p, approved })),
      skipDuplicates: true,
    });
    return count;
  }

  find(partnerId: number, invoiceId: number, productId: number) {
    return this.prisma.partnerItem.findUnique({
      where: { partnerId_invoiceId_productId: { partnerId, invoiceId, productId } },
    });
  }

  update(id: number, data: { rate: number | null; percent: number | null; approved: boolean }) {
    return this.prisma.partnerItem.update({ where: { id }, data });
  }

  remove(id: number) {
    return this.prisma.partnerItem.delete({ where: { id } });
  }
}
