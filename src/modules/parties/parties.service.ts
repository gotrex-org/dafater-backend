import { Injectable, NotFoundException } from '@nestjs/common';
import { PartyRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BalancesService } from '../balances/balances.service';
import { CreatePartyDto, UpdatePartyDto } from './dto/party.dto';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';

@Injectable()
export class PartiesService {
  constructor(
    private prisma: PrismaService,
    private balances: BalancesService,
  ) {}

  async findAll(q: PaginationQueryDto, role?: PartyRole, includeHidden = false) {
    const where = {
      ...(role ? { role } : {}),
      ...(includeHidden ? {} : { hidden: false }),
      ...(q.search ? { name: { contains: q.search, mode: 'insensitive' as const } } : {}),
    };
    const result = await paginate(this.prisma.party, q, { where, orderBy: { name: 'asc' } });
    const byId = await this.balances.allPartyBalances();
    // last activity (most recent transaction date) per party — for "sort by activity"
    const acts = await this.prisma.transaction.groupBy({
      by: ['partyId'], _max: { date: true }, where: { partyId: { not: null } },
    });
    const lastById: Record<number, Date | null> = {};
    for (const a of acts) if (a.partyId != null) lastById[a.partyId] = a._max.date;
    result.data = result.data.map((p: any) => ({
      ...p, balance: byId[p.id] ?? p.opening, lastActivity: lastById[p.id] ?? null,
    }));
    return result;
  }

  async findOne(id: string) {
    const party = await this.prisma.party.findUnique({ where: { uid: id } });
    if (!party) throw new NotFoundException('Party not found');
    return { ...party, balance: await this.balances.partyBalance(party.id) };
  }

  /** Ledger statement: opening + transactions with running balance, optional date period. */
  async ledger(id: string, from?: string, to?: string) {
    const party = await this.findOne(id);
    const txns = await this.prisma.transaction.findMany({
      where: { partyId: party.id },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      include: {
        invoice: { select: { uid: true, items: { select: { qty: true, price: true, product: { select: { name: true } } } } } },
        deal: { select: { uid: true, items: { select: { qty: true, price: true, product: { select: { name: true } } } } } },
      },
    });
    const fromD = from ? new Date(from) : null;
    const toD = to ? new Date(to) : null;

    let running = party.opening || 0;
    let periodOpening = party.opening || 0;
    const rows: any[] = [];
    for (const t of txns) {
      if (fromD && t.date < fromD) {
        running += (t.debit || 0) - (t.credit || 0);
        periodOpening = running; // balance carried into the period
        continue;
      }
      running += (t.debit || 0) - (t.credit || 0);
      if (toD && t.date > toD) continue; // beyond the period — affects nothing shown
      rows.push({
        id: t.uid,
        date: t.date,
        type: t.type,
        note: t.note,
        debit: t.debit,
        credit: t.credit,
        balance: running,
        invoiceUid: t.invoice?.uid ?? null,
        dealUid: t.deal?.uid ?? null,
        invoiceItems: t.invoice
          ? t.invoice.items.map((it) => ({ name: it.product?.name ?? '', qty: it.qty, price: it.price }))
          : t.deal
          ? t.deal.items.map((it) => ({ name: it.product?.name ?? '', qty: it.qty, price: it.price }))
          : null,
      });
    }
    const closing = rows.length ? rows[rows.length - 1].balance : periodOpening;
    return { party, opening: periodOpening, rows, balance: closing };
  }

  create(dto: CreatePartyDto) {
    return this.prisma.party.create({ data: dto });
  }

  update(id: string, dto: UpdatePartyDto) {
    return this.prisma.party.update({ where: { uid: id }, data: dto });
  }

  remove(id: string) {
    // transactions cascade per schema; invoices use Restrict so this throws if referenced
    return this.prisma.party.delete({ where: { uid: id } });
  }
}
