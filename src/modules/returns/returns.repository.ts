import { BadRequestException, Injectable } from '@nestjs/common';
import { InvoiceKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { CreateReturnDto } from './dto/returns.dto';

const RETURN_INCLUDE = {
  party: true,
  warehouse: true,
  treasury: true,
  invoice: { select: { uid: true, no: true, kind: true } },
  items: { include: { product: true } },
} as const;

@Injectable()
export class ReturnsRepository {
  constructor(private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto, kind?: InvoiceKind) {
    const where: any = {};
    if (kind) where.kind = kind;
    if (q.search) where.OR = [
      { no: { contains: q.search } },
      { party: { name: { contains: q.search, mode: 'insensitive' } } },
    ];
    if (q.from || q.to) where.date = {
      gte: q.from ? new Date(q.from) : undefined,
      lt: q.to ? new Date(new Date(q.to).getTime() + 86400000) : undefined,
    };
    return paginate(this.prisma.return, q, {
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: RETURN_INCLUDE,
    });
  }

  findOne(id: string) {
    return this.prisma.return.findUnique({ where: { uid: id }, include: RETURN_INCLUDE });
  }

  findByUid(id: string) {
    return this.prisma.return.findUnique({ where: { uid: id }, select: { id: true } });
  }

  remove(id: string) {
    // ReturnItem and the generated Transactions cascade-delete via their FKs.
    return this.prisma.return.delete({ where: { uid: id } });
  }

  async create(dto: CreateReturnDto, createdById?: number) {
    const date = new Date(dto.date);
    const isSale = dto.kind === InvoiceKind.SALE;
    const total = dto.items.reduce((s, it) => s + it.qty * it.price, 0);
    const refund = dto.refund && dto.refund > 0 ? dto.refund : 0;

    return this.prisma.$transaction(async (tx) => {
      const [party, warehouse, treasury] = await Promise.all([
        tx.party.findUniqueOrThrow({ where: { uid: dto.partyId }, select: { id: true } }),
        tx.warehouse.findUniqueOrThrow({ where: { uid: dto.warehouseId }, select: { id: true } }),
        dto.treasuryId
          ? tx.treasuryAccount.findUniqueOrThrow({ where: { uid: dto.treasuryId }, select: { id: true } })
          : Promise.resolve(null),
      ]);

      const products = await tx.product.findMany({
        where: { uid: { in: dto.items.map((it) => it.productId) } },
        select: { id: true, uid: true },
      });
      const productIdByUid = new Map(products.map((p) => [p.uid, p.id]));

      // Resolve + validate the linked invoice: can't return more than was sold/bought
      // (minus what was already returned against it).
      let invoiceId: number | null = null;
      if (dto.invoiceId) {
        const invoice = await tx.invoice.findUniqueOrThrow({
          where: { uid: dto.invoiceId },
          include: { items: true },
        });
        invoiceId = invoice.id;
        const soldByProduct = new Map<number, number>();
        for (const it of invoice.items) soldByProduct.set(it.productId, (soldByProduct.get(it.productId) || 0) + it.qty);
        const prevReturns = await tx.returnItem.findMany({
          where: { return: { invoiceId: invoice.id } },
          select: { productId: true, qty: true },
        });
        const returnedByProduct = new Map<number, number>();
        for (const r of prevReturns) returnedByProduct.set(r.productId, (returnedByProduct.get(r.productId) || 0) + r.qty);
        for (const it of dto.items) {
          const pid = productIdByUid.get(it.productId)!;
          const sold = soldByProduct.get(pid) || 0;
          const already = returnedByProduct.get(pid) || 0;
          if (it.qty > sold - already + 0.0001) {
            throw new BadRequestException(`الكمية المرتجعة أكبر من المتبقي في الفاتورة (المتبقي ${Math.max(0, sold - already)})`);
          }
        }
      }

      const no = dto.no?.trim() || (await this.nextNo(tx, party.id));

      const ret = await tx.return.create({
        data: {
          kind: dto.kind,
          no,
          date,
          partyId: party.id,
          warehouseId: warehouse.id,
          invoiceId,
          refund,
          treasuryId: treasury?.id ?? null,
          note: dto.note ?? null,
          items: {
            create: dto.items.map((it) => ({
              productId: productIdByUid.get(it.productId)!,
              qty: it.qty,
              price: it.price,
            })),
          },
        },
      });

      const txns = this.buildTxns(ret.id, { partyId: party.id, treasuryId: treasury?.id ?? null, date, no, total, refund, isSale, createdById });
      if (txns.length) await tx.transaction.createMany({ data: txns });

      return tx.return.findUnique({ where: { id: ret.id }, include: RETURN_INCLUDE });
    });
  }

  async nextNo(tx: Prisma.TransactionClient, partyId: number): Promise<string> {
    const rows = await tx.return.findMany({ where: { partyId }, select: { no: true } });
    const max = rows.reduce((mx, r) => {
      const n = parseInt(r.no, 10);
      return Number.isFinite(n) && n > mx ? n : mx;
    }, 0);
    return String(max + 1);
  }

  async peekNextNo(partyUid: string): Promise<{ no: string }> {
    const party = await this.prisma.party.findUnique({ where: { uid: partyUid }, select: { id: true } });
    if (!party) return { no: '1' };
    const rows = await this.prisma.return.findMany({ where: { partyId: party.id }, select: { no: true } });
    const max = rows.reduce((mx, r) => {
      const n = parseInt(r.no, 10);
      return Number.isFinite(n) && n > mx ? n : mx;
    }, 0);
    return { no: String(max + 1) };
  }

  // Ledger movements for a return:
  //   SALE return     → credit the client (يقل اللي عليه); optional cash refund out of the treasury.
  //   PURCHASE return → debit the supplier (يقل اللي له); optional cash received back into the treasury.
  private buildTxns(
    returnId: number,
    p: {
      partyId: number; treasuryId: number | null; date: Date; no: string;
      total: number; refund: number; isSale: boolean; createdById?: number;
    },
  ): Prisma.TransactionCreateManyInput[] {
    const { partyId, treasuryId, date, no, total, refund, isSale, createdById } = p;
    const txns: Prisma.TransactionCreateManyInput[] = [];
    if (isSale) {
      txns.push({ date, type: 'مرتجع بيع', partyId, credit: total, note: `مرتجع بيع #${no}`, returnId });
      if (refund > 0) txns.push({ date, type: 'استرداد نقدي', partyId, treasuryId, debit: refund, cashOut: refund, note: `استرداد نقدي — مرتجع #${no}`, returnId });
    } else {
      txns.push({ date, type: 'مرتجع شراء', partyId, debit: total, note: `مرتجع شراء #${no}`, returnId });
      if (refund > 0) txns.push({ date, type: 'مبلغ مسترد', partyId, treasuryId, credit: refund, cashIn: refund, note: `مبلغ مسترد — مرتجع #${no}`, returnId });
    }
    return createdById ? txns.map((t) => ({ ...t, createdById })) : txns;
  }
}
