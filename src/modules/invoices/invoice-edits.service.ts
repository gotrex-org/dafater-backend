import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateInvoiceDto } from './dto/invoices.dto';
import { InvoicesService } from './invoices.service';

/** شكل الفاتورة للمقارنة قبل/بعد في شاشة الموافقة — أسماء بدل المعرّفات. */
export interface InvoiceSnapshot {
  date: string;
  partyName: string;
  warehouseName: string;
  items: { name: string; qty: number; price: number }[];
  charges: { name: string; qty: number; price: number }[];
  paid: number;
  discount: number;
  fake: boolean;
  note: string | null;
  total: number;
}

const total = (s: Pick<InvoiceSnapshot, 'items' | 'charges'>) =>
  s.items.reduce((t, i) => t + i.qty * i.price, 0) + s.charges.reduce((t, c) => t + c.qty * c.price, 0);

/**
 * تعديل الفواتير لغير المالك: التعديل بيتحفظ معلّق والفاتورة زي ما هي، والمالك
 * يوافق (يتطبّق بنفس مسار التعديل العادي) أو يرفض (يتمسح).
 */
@Injectable()
export class InvoiceEditsService {
  constructor(private prisma: PrismaService, private invoices: InvoicesService) {}

  /** تعديل واحد معلّق لكل فاتورة — الأحدث بيحل محل اللي قبله. */
  async request(invoiceUid: string, dto: UpdateInvoiceDto, userId?: number) {
    const inv = await this.prisma.invoice.findUnique({ where: { uid: invoiceUid }, select: { id: true } });
    if (!inv) throw new NotFoundException('Invoice not found');
    const payload = JSON.parse(JSON.stringify(dto));
    await this.prisma.invoiceEditRequest.upsert({
      where: { invoiceId: inv.id },
      create: { invoiceId: inv.id, payload, requestedById: userId ?? null },
      update: { payload, requestedById: userId ?? null, createdAt: new Date() },
    });
    return { pending: true };
  }

  async list() {
    const rows = await this.prisma.invoiceEditRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        requestedBy: { select: { name: true } },
        invoice: { select: { uid: true, no: true, kind: true, date: true, party: { select: { name: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.uid,
      createdAt: r.createdAt,
      requestedBy: r.requestedBy?.name ?? null,
      invoiceId: r.invoice.uid,
      invoiceNo: r.invoice.no,
      kind: r.invoice.kind,
      partyName: r.invoice.party.name,
    }));
  }

  /** الفاتورة دلوقتي جنب التعديل المطلوب. */
  async detail(uid: string) {
    const r = await this.find(uid);
    const inv = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: r.invoiceId },
      include: {
        party: { select: { name: true } }, warehouse: { select: { name: true } },
        items: { orderBy: { id: 'asc' }, include: { product: { select: { name: true } } } },
        charges: { orderBy: { id: 'asc' }, include: { chargeType: { select: { name: true } } } },
      },
    });
    const before: Omit<InvoiceSnapshot, 'total'> = {
      date: inv.date.toISOString(),
      partyName: inv.party.name,
      warehouseName: inv.warehouse.name,
      items: inv.items.map((i) => ({ name: i.product.name, qty: i.qty, price: i.price })),
      charges: inv.charges.map((c) => ({ name: c.chargeType.name, qty: c.qty, price: c.price })),
      paid: inv.paid, discount: inv.discount, fake: inv.fake, note: inv.note,
    };
    const after = await this.snapshot(r.payload as unknown as UpdateInvoiceDto);
    return {
      id: r.uid,
      createdAt: r.createdAt,
      requestedBy: r.requestedBy?.name ?? null,
      invoiceId: inv.uid,
      invoiceNo: inv.no,
      kind: inv.kind,
      before: { ...before, total: total(before) },
      after: { ...after, total: total(after) },
    };
  }

  async approve(uid: string) {
    const r = await this.find(uid);
    const inv = await this.prisma.invoice.findUniqueOrThrow({ where: { id: r.invoiceId }, select: { uid: true } });
    // نفس مسار التعديل العادي (تحقق الخزنة والإجماليات)، وباسم اللي طلب التعديل
    const res = await this.invoices.update(inv.uid, r.payload as unknown as UpdateInvoiceDto, r.requestedById ?? undefined);
    await this.prisma.invoiceEditRequest.deleteMany({ where: { id: r.id } });
    return res;
  }

  async reject(uid: string) {
    const r = await this.find(uid);
    await this.prisma.invoiceEditRequest.delete({ where: { id: r.id } });
    return { ok: true };
  }

  private async find(uid: string) {
    const r = await this.prisma.invoiceEditRequest.findUnique({
      where: { uid }, include: { requestedBy: { select: { name: true } } },
    });
    if (!r) throw new NotFoundException('هذا التعديل غير موجود، ربما تمت الموافقة عليه أو رفضه');
    return r;
  }

  private async snapshot(dto: UpdateInvoiceDto): Promise<Omit<InvoiceSnapshot, 'total'>> {
    const productUids = [...new Set(dto.items.map((i) => i.productId))];
    const chargeUids = [...new Set((dto.charges ?? []).map((c) => c.chargeTypeId))];
    const [party, warehouse, products, chargeTypes] = await Promise.all([
      this.prisma.party.findUnique({ where: { uid: dto.partyId }, select: { name: true } }),
      this.prisma.warehouse.findUnique({ where: { uid: dto.warehouseId }, select: { name: true } }),
      this.prisma.product.findMany({ where: { uid: { in: productUids } }, select: { uid: true, name: true } }),
      this.prisma.chargeType.findMany({ where: { uid: { in: chargeUids } }, select: { uid: true, name: true } }),
    ]);
    const pName = new Map(products.map((p) => [p.uid, p.name]));
    const cName = new Map(chargeTypes.map((c) => [c.uid, c.name]));
    return {
      date: new Date(dto.date).toISOString(),
      partyName: party?.name ?? '—',
      warehouseName: warehouse?.name ?? '—',
      items: dto.items.map((i) => ({ name: pName.get(i.productId) ?? '—', qty: i.qty, price: i.price })),
      charges: (dto.charges ?? []).map((c) => ({ name: cName.get(c.chargeTypeId) ?? '—', qty: c.qty ?? 1, price: c.price })),
      paid: dto.paid ?? 0, discount: dto.discount ?? 0, fake: !!dto.fake, note: dto.note ?? null,
    };
  }
}
