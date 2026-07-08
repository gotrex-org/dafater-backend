import { Injectable } from '@nestjs/common';
import { InvoiceKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { CreateInvoiceDto, UpdateInvoiceDto, CommissionDto } from './dto/invoices.dto';

const INVOICE_INCLUDE = { items: { include: { product: true } }, party: true, warehouse: true } as const;

@Injectable()
export class InvoicesRepository {
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
    return paginate(this.prisma.invoice, q, {
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { party: true, warehouse: true, items: { include: { product: true } } },
    });
  }

  findOne(id: string) {
    return this.prisma.invoice.findUnique({
      where: { uid: id },
      include: { party: true, warehouse: true, treasury: true, items: { include: { product: true } } },
    });
  }

  async create(dto: CreateInvoiceDto, computed: { total: number; paid: number; isSale: boolean }) {
    const { total, paid, isSale } = computed;
    const date = new Date(dto.date);

    return this.prisma.$transaction(async (tx) => {
      const [party, warehouse, treasury] = await Promise.all([
        tx.party.findUniqueOrThrow({ where: { uid: dto.partyId }, select: { id: true, currency: true } }),
        tx.warehouse.findUniqueOrThrow({ where: { uid: dto.warehouseId }, select: { id: true } }),
        dto.treasuryId
          ? tx.treasuryAccount.findUniqueOrThrow({ where: { uid: dto.treasuryId }, select: { id: true } })
          : Promise.resolve(null),
      ]);
      const commissionParty = dto.commissionPartyId
        ? await tx.party.findUniqueOrThrow({ where: { uid: dto.commissionPartyId }, select: { id: true, name: true } })
        : null;
      const products = await tx.product.findMany({
        where: { uid: { in: dto.items.map((it) => it.productId) } },
        select: { id: true, uid: true },
      });
      const productIdByUid = new Map(products.map((p) => [p.uid, p.id]));
      const no = dto.no?.trim() || (await this.nextNo(tx, party.id));

      const invoice = await tx.invoice.create({
        data: {
          kind: dto.kind,
          no,
          date,
          currency: party.currency,
          partyId: party.id,
          warehouseId: warehouse.id,
          paid,
          treasuryId: treasury?.id ?? null,
          note: dto.note,
          commissionAmount: dto.commissionAmount ?? null,
          commissionTo: commissionParty?.name ?? null,
          items: {
            create: dto.items.map((it) => ({
              productId: productIdByUid.get(it.productId)!,
              qty: it.qty,
              price: it.price,
            })),
          },
        },
      });

      const txns = this.buildTxns(invoice.id, { party, treasury, commissionParty, date, no, total, paid, isSale, dto });
      if (txns.length) await tx.transaction.createMany({ data: txns });

      return tx.invoice.findUnique({ where: { id: invoice.id }, include: INVOICE_INCLUDE });
    });
  }

  async update(id: string, dto: UpdateInvoiceDto, computed: { total: number; paid: number }) {
    const { total, paid } = computed;
    const date = new Date(dto.date);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.invoice.findUniqueOrThrow({ where: { uid: id }, select: { id: true, kind: true, no: true } });
      const { id: invId, kind, no } = existing;
      const isSale = kind === InvoiceKind.SALE;

      await tx.transaction.deleteMany({ where: { invoiceId: invId } });

      const [party, warehouse, treasury] = await Promise.all([
        tx.party.findUniqueOrThrow({ where: { uid: dto.partyId }, select: { id: true, currency: true } }),
        tx.warehouse.findUniqueOrThrow({ where: { uid: dto.warehouseId }, select: { id: true } }),
        dto.treasuryId
          ? tx.treasuryAccount.findUniqueOrThrow({ where: { uid: dto.treasuryId }, select: { id: true } })
          : Promise.resolve(null),
      ]);
      const commissionParty = dto.commissionPartyId
        ? await tx.party.findUniqueOrThrow({ where: { uid: dto.commissionPartyId }, select: { id: true, name: true } })
        : null;
      const products = await tx.product.findMany({
        where: { uid: { in: dto.items.map((it) => it.productId) } },
        select: { id: true, uid: true },
      });
      const productIdByUid = new Map(products.map((p) => [p.uid, p.id]));

      await tx.invoice.update({
        where: { id: invId },
        data: {
          date,
          currency: party.currency,
          partyId: party.id,
          warehouseId: warehouse.id,
          paid,
          treasuryId: treasury?.id ?? null,
          note: dto.note ?? null,
          commissionAmount: dto.commissionAmount ?? null,
          commissionTo: commissionParty?.name ?? null,
          items: {
            deleteMany: {},
            create: dto.items.map((it) => ({
              productId: productIdByUid.get(it.productId)!,
              qty: it.qty,
              price: it.price,
            })),
          },
        },
      });

      const txns = this.buildTxns(invId, { party, treasury, commissionParty, date, no, total, paid, isSale, dto });
      if (txns.length) await tx.transaction.createMany({ data: txns });

      return tx.invoice.findUnique({ where: { id: invId }, include: INVOICE_INCLUDE });
    });
  }

  async updateCommission(uid: string, dto: CommissionDto) {
    const inv = await this.prisma.invoice.findUniqueOrThrow({ where: { uid }, select: { id: true, date: true, no: true } });
    return this.prisma.$transaction(async (tx) => {
      await tx.transaction.deleteMany({ where: { invoiceId: inv.id, type: 'commission' } });
      if (dto.commissionAmount && dto.commissionAmount > 0 && dto.commissionPartyId) {
        const cp = await tx.party.findUniqueOrThrow({ where: { uid: dto.commissionPartyId }, select: { id: true, name: true } });
        await tx.transaction.create({
          data: { date: inv.date, type: 'commission', partyId: cp.id, credit: dto.commissionAmount, note: `عمولة فاتورة #${inv.no}`, invoiceId: inv.id },
        });
        await tx.invoice.update({ where: { id: inv.id }, data: { commissionAmount: dto.commissionAmount, commissionTo: cp.name } });
      } else {
        await tx.invoice.update({ where: { id: inv.id }, data: { commissionAmount: null, commissionTo: null } });
      }
    });
  }

  findByUid(id: string) {
    return this.prisma.invoice.findUnique({ where: { uid: id }, select: { id: true } });
  }

  countRelatedTransactions(id: number) {
    return this.prisma.transaction.count({ where: { invoiceId: id } });
  }

  remove(id: string) {
    return this.prisma.invoice.delete({ where: { uid: id } });
  }

  async nextNo(tx: Prisma.TransactionClient, partyId: number): Promise<string> {
    const rows = await tx.invoice.findMany({ where: { partyId }, select: { no: true } });
    const max = rows.reduce((mx, r) => {
      const n = parseInt(r.no, 10);
      return Number.isFinite(n) && n > mx ? n : mx;
    }, 0);
    return String(max + 1);
  }

  async peekNextNo(partyUid: string): Promise<{ no: string }> {
    const party = await this.prisma.party.findUnique({ where: { uid: partyUid }, select: { id: true } });
    if (!party) return { no: '1' };
    const rows = await this.prisma.invoice.findMany({ where: { partyId: party.id }, select: { no: true } });
    const max = rows.reduce((mx, r) => {
      const n = parseInt(r.no, 10);
      return Number.isFinite(n) && n > mx ? n : mx;
    }, 0);
    return { no: String(max + 1) };
  }

  private buildTxns(
    invoiceId: number,
    p: {
      party: { id: number }; treasury: { id: number } | null;
      commissionParty: { id: number; name: string } | null;
      date: Date; no: string; total: number; paid: number; isSale: boolean;
      dto: CreateInvoiceDto | UpdateInvoiceDto;
    },
  ): Prisma.TransactionCreateManyInput[] {
    const { party, treasury, commissionParty, date, no, total, paid, isSale, dto } = p;
    const txns: Prisma.TransactionCreateManyInput[] = [];
    if (isSale) {
      txns.push({ date, type: 'فاتورة بيع', partyId: party.id, debit: total, note: `فاتورة بيع #${no}`, invoiceId });
      if (paid > 0) txns.push({ date, type: 'تحصيل', partyId: party.id, treasuryId: treasury?.id ?? null, credit: paid, cashIn: paid, note: `محصّل مع فاتورة #${no}`, invoiceId });
    } else {
      txns.push({ date, type: 'فاتورة شراء', partyId: party.id, credit: total, note: `فاتورة شراء #${no}`, invoiceId });
      if (paid > 0) txns.push({ date, type: 'دفعة لمورد', partyId: party.id, treasuryId: treasury?.id ?? null, debit: paid, cashOut: paid, note: `مدفوع مع فاتورة #${no}`, invoiceId });
      if (dto.commissionAmount && dto.commissionAmount > 0 && commissionParty) {
        txns.push({ date, type: 'commission', partyId: commissionParty.id, credit: dto.commissionAmount, note: `عمولة فاتورة #${no}`, invoiceId });
      }
    }
    return txns;
  }
}
