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

/** مستند الشراء: فاتورة شراء، أو عملية بيع خارجي (الشراء فيها من المورد بـ buyPrice). */
export type DocKind = 'invoice' | 'deal';

/** مرجع صنف من الشاشة: uid المستند والصنف، و`kind` = 'deal' للبيع الخارجي. */
export interface ItemRefInput {
  invoiceId: string;
  productId: string;
  kind?: DocKind;
}

/** نفس المرجع بالـ ids — واحد بس من invoiceId و dealId. */
export interface ItemKey {
  invoiceId: number | null;
  dealId: number | null;
  productId: number;
}

/** سطر شراء موحّد من فاتورة أو بيع خارجي. */
export interface PurchaseLine {
  kind: DocKind;
  docId: number;
  docUid: string;
  no: string;
  date: Date;
  supplierName: string;
  buyer: string | null;
  productId: number;
  product: { uid: string; name: string; unit: string | null };
  qty: number;
}

const PURCHASE = { kind: 'PURCHASE' as const, fake: false };
const DEAL_BUY_TX = 'شراء خارجي';

// «سجّلها»: أول مستخدم سجّل حركة المستند — الفاتورة والبيع الخارجي مالهمش createdBy
// خاص بيهم، وحركاتهم بتتعمل باسم اللي سجّلهم.
const BUYER = {
  where: { createdById: { not: null } },
  select: { createdBy: { select: { name: true } } },
  orderBy: { id: 'asc' as const },
  take: 1,
};

const dateRange = (from?: Date, to?: Date) =>
  (from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {});

/**
 * أصناف التصفية الثابتة (PartnerItem): صنف من فاتورة شراء أو من بيع خارجي، مش
 * المستند كله. أي مستند حقيقي ينفع — الاختيار بالصنف نفسه، مش بمورد الاسم.
 */
@Injectable()
export class SettlementItemsRepository {
  constructor(private prisma: PrismaService) {}

  /** الأصناف المختارة للاسم، ومعاها أسطر الصنف في المستند (الكمية والسعر). */
  selected(partnerId: number) {
    return this.prisma.partnerItem.findMany({
      where: { partnerId },
      include: {
        product: { select: { uid: true, name: true, unit: true } },
        invoice: {
          select: {
            id: true, uid: true, no: true, date: true, currency: true,
            party: { select: { name: true } },
            items: { select: { productId: true, qty: true, price: true } },
            transactions: BUYER,
          },
        },
        deal: {
          select: {
            id: true, uid: true, no: true, date: true,
            supplier: { select: { name: true, currency: true } },
            items: { select: { productId: true, qty: true, buyPrice: true } },
            // حركة «شراء خارجي» — سعرها بالجنيه من دورة الدولار، و«سجّلها» منها
            transactions: { where: { type: DEAL_BUY_TX }, select: { id: true, createdBy: { select: { name: true } } } },
          },
        },
      },
      orderBy: { id: 'asc' },
    });
  }

  /** أسطر الشراء (غير الخدمية) في الفترة من الفواتير والبيع الخارجي — البحث بالاسم بعدها. */
  async purchaseLines(from?: Date, to?: Date): Promise<PurchaseLine[]> {
    const [inv, deal] = await Promise.all([
      this.prisma.invoiceItem.findMany({
        where: { product: { service: false }, invoice: { ...PURCHASE, ...dateRange(from, to) } },
        select: {
          qty: true, productId: true,
          product: { select: { uid: true, name: true, unit: true } },
          invoice: { select: { id: true, uid: true, no: true, date: true, party: { select: { name: true } }, transactions: BUYER } },
        },
      }),
      this.prisma.dealItem.findMany({
        where: { product: { service: false }, deal: dateRange(from, to) },
        select: {
          qty: true, productId: true,
          product: { select: { uid: true, name: true, unit: true } },
          deal: { select: { id: true, uid: true, no: true, date: true, supplier: { select: { name: true } }, transactions: BUYER } },
        },
      }),
    ]);
    const lines: PurchaseLine[] = [
      ...inv.map((l) => ({
        kind: 'invoice' as const, docId: l.invoice.id, docUid: l.invoice.uid, no: l.invoice.no,
        date: l.invoice.date, supplierName: l.invoice.party?.name ?? '',
        buyer: l.invoice.transactions[0]?.createdBy?.name ?? null,
        productId: l.productId, product: l.product, qty: l.qty,
      })),
      ...deal.map((l) => ({
        kind: 'deal' as const, docId: l.deal.id, docUid: l.deal.uid, no: l.deal.no,
        date: l.deal.date, supplierName: l.deal.supplier?.name ?? '',
        buyer: l.deal.transactions[0]?.createdBy?.name ?? null,
        productId: l.productId, product: l.product, qty: l.qty,
      })),
    ];
    return lines.sort((a, b) => b.date.getTime() - a.date.getTime() || b.docId - a.docId);
  }

  marks(partnerId: number, invoiceIds: number[], dealIds: number[]) {
    return this.prisma.partnerItem.findMany({
      where: { partnerId, OR: [{ invoiceId: { in: invoiceIds } }, { dealId: { in: dealIds } }] },
      select: { invoiceId: true, dealId: true, productId: true, approved: true },
    });
  }

  /**
   * المراجع بالـ uid → ids، بعد التأكد إن المستند حقيقي والصنف فيه. القيد هنا لأن
   * الـ API مدخل مستقل عن الشاشة.
   */
  async resolve(refs: ItemRefInput[]): Promise<ItemKey[]> {
    const invRefs = refs.filter((r) => r.kind !== 'deal');
    const dealRefs = refs.filter((r) => r.kind === 'deal');
    const [invLines, dealLines] = await Promise.all([
      this.prisma.invoiceItem.findMany({
        where: {
          product: { uid: { in: invRefs.map((p) => p.productId) }, service: false },
          invoice: { ...PURCHASE, uid: { in: invRefs.map((p) => p.invoiceId) } },
        },
        select: { invoiceId: true, productId: true, invoice: { select: { uid: true } }, product: { select: { uid: true } } },
      }),
      this.prisma.dealItem.findMany({
        where: {
          product: { uid: { in: dealRefs.map((p) => p.productId) }, service: false },
          deal: { uid: { in: dealRefs.map((p) => p.invoiceId) } },
        },
        select: { dealId: true, productId: true, deal: { select: { uid: true } }, product: { select: { uid: true } } },
      }),
    ]);
    const inv = new Map(invLines.map((l) => [`${l.invoice.uid}:${l.product.uid}`, l]));
    const deal = new Map(dealLines.map((l) => [`${l.deal.uid}:${l.product.uid}`, l]));
    return refs.map((r) => {
      if (r.kind === 'deal') {
        const l = deal.get(`${r.invoiceId}:${r.productId}`);
        if (!l) throw new NotFoundException('الصنف غير موجود في عملية البيع الخارجي');
        return { invoiceId: null, dealId: l.dealId, productId: l.productId };
      }
      const l = inv.get(`${r.invoiceId}:${r.productId}`);
      if (!l) throw new NotFoundException('الصنف غير موجود في فاتورة الشراء، أو الفاتورة وهمية');
      return { invoiceId: l.invoiceId, dealId: null, productId: l.productId };
    });
  }

  async add(partnerId: number, keys: ItemKey[], approved: boolean) {
    const { count } = await this.prisma.partnerItem.createMany({
      data: keys.map((k) => ({ partnerId, ...k, approved })),
      skipDuplicates: true,
    });
    return count;
  }

  find(partnerId: number, key: ItemKey) {
    return this.prisma.partnerItem.findFirst({ where: { partnerId, ...key } });
  }

  update(id: number, data: { rate: number | null; percent: number | null; approved: boolean }) {
    return this.prisma.partnerItem.update({ where: { id }, data });
  }

  remove(id: number) {
    return this.prisma.partnerItem.delete({ where: { id } });
  }
}
