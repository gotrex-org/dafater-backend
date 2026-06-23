import { Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/pagination';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateInvoiceDto } from './dto/invoices.dto';

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto, kind?: InvoiceKind) {
    return paginate(this.prisma.invoice, q, {
      where: kind ? { kind } : {},
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { party: true, warehouse: true, items: { include: { product: true } } },
    });
  }

  async findOne(id: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { uid: id },
      include: { party: true, warehouse: true, treasury: true, items: { include: { product: true } } },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  /**
   * Creates an invoice + its derived ledger transactions in one DB transaction.
   * Stock is NOT written separately — it is derived from invoice items by
   * BalancesService.stockOf (sale lines subtract, purchase lines add).
   */
  async create(dto: CreateInvoiceDto) {
    const total = dto.items.reduce((s, it) => s + it.qty * it.price, 0);
    const paid = dto.paid || 0;
    const isSale = dto.kind === InvoiceKind.SALE;
    const date = new Date(dto.date);

    return this.prisma.$transaction(async (tx) => {
      // resolve all public uids in the request to internal integer ids
      const [party, warehouse, treasury] = await Promise.all([
        tx.party.findUniqueOrThrow({ where: { uid: dto.partyId }, select: { id: true } }),
        tx.warehouse.findUniqueOrThrow({ where: { uid: dto.warehouseId }, select: { id: true } }),
        dto.treasuryId
          ? tx.treasuryAccount.findUniqueOrThrow({ where: { uid: dto.treasuryId }, select: { id: true } })
          : Promise.resolve(null),
      ]);
      // commission recipient (agent) — its ledger gets credited below
      const commissionParty = dto.commissionPartyId
        ? await tx.party.findUniqueOrThrow({ where: { uid: dto.commissionPartyId }, select: { id: true, name: true } })
        : null;
      const products = await tx.product.findMany({
        where: { uid: { in: dto.items.map((it) => it.productId) } },
        select: { id: true, uid: true },
      });
      const productIdByUid = new Map(products.map((p) => [p.uid, p.id]));

      // auto-number per party (each client/supplier has its own running sequence)
      const no = dto.no?.trim() || (await this.nextNo(tx, party.id));

      const invoice = await tx.invoice.create({
        data: {
          kind: dto.kind,
          no,
          date,
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

      const txns: Prisma.TransactionCreateManyInput[] = [];

      if (isSale) {
        // customer owes us the full amount
        txns.push({
          date, type: 'فاتورة بيع', partyId: party.id,
          debit: total, note: `فاتورة بيع #${no}`, invoiceId: invoice.id,
        });
        if (paid > 0) {
          txns.push({
            date, type: 'تحصيل', partyId: party.id, treasuryId: treasury?.id ?? null,
            credit: paid, cashIn: paid, note: `محصّل مع فاتورة #${no}`, invoiceId: invoice.id,
          });
        }
      } else {
        // we owe the supplier the full amount
        txns.push({
          date, type: 'فاتورة شراء', partyId: party.id,
          credit: total, note: `فاتورة شراء #${no}`, invoiceId: invoice.id,
        });
        if (paid > 0) {
          txns.push({
            date, type: 'دفعة لمورد', partyId: party.id, treasuryId: treasury?.id ?? null,
            debit: paid, cashOut: paid, note: `مدفوع مع فاتورة #${no}`, invoiceId: invoice.id,
          });
        }
        if (dto.commissionAmount && dto.commissionAmount > 0 && commissionParty) {
          // we owe the agent their commission → credit their ledger
          txns.push({
            date, type: 'commission', partyId: commissionParty.id,
            credit: dto.commissionAmount,
            note: `عمولة فاتورة #${no}`,
            invoiceId: invoice.id,
          });
        }
      }

      if (txns.length) await tx.transaction.createMany({ data: txns });

      return tx.invoice.findUnique({
        where: { id: invoice.id },
        include: { items: { include: { product: true } }, party: true, warehouse: true },
      });
    });
  }

  /** Next running invoice number for a party: max existing numeric `no` + 1. */
  private async nextNo(tx: Prisma.TransactionClient, partyId: number): Promise<string> {
    const rows = await tx.invoice.findMany({ where: { partyId }, select: { no: true } });
    const max = rows.reduce((mx, r) => {
      const n = parseInt(r.no, 10);
      return Number.isFinite(n) && n > mx ? n : mx;
    }, 0);
    return String(max + 1);
  }

  /** Deleting an invoice cascades its transactions (invoiceId relation). */
  remove(id: string) {
    return this.prisma.invoice.delete({ where: { uid: id } });
  }
}
