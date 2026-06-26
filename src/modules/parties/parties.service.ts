import { Injectable, NotFoundException } from '@nestjs/common';
import { PartyRole } from '@prisma/client';
import { BalancesService } from '../balances/balances.service';
import { CreatePartyDto, UpdatePartyDto } from './dto/party.dto';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { PartiesRepository } from './parties.repository';

@Injectable()
export class PartiesService {
  constructor(
    private repo: PartiesRepository,
    private balances: BalancesService,
  ) {}

  async findAll(q: PaginationQueryDto, role?: PartyRole, includeHidden = false) {
    const result = await this.repo.findAll(q, role, includeHidden);
    const byId = await this.balances.allPartyBalances();
    const lastById = await this.repo.lastActivityByParty();
    result.data = result.data.map((p: any) => ({
      ...p, balance: byId[p.id] ?? p.opening, lastActivity: lastById[p.id] ?? null,
    }));
    return result;
  }

  async findOne(id: string) {
    const party = await this.repo.findOneByUid(id);
    if (!party) throw new NotFoundException('Party not found');
    return { ...party, balance: await this.balances.partyBalance(party.id) };
  }

  async ledger(id: string, from?: string, to?: string) {
    const party = await this.findOne(id);
    const txns = await this.repo.ledgerTransactions(party.id);
    const fromD = from ? new Date(from) : null;
    const toD = to ? new Date(to) : null;

    let running = party.opening || 0;
    let periodOpening = party.opening || 0;
    const rows: any[] = [];
    for (const t of txns) {
      if (fromD && t.date < fromD) {
        running += (t.debit || 0) - (t.credit || 0);
        periodOpening = running;
        continue;
      }
      running += (t.debit || 0) - (t.credit || 0);
      if (toD && t.date > toD) continue;
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
          ? t.invoice.items.map((it: any) => ({ name: it.product?.name ?? '', qty: it.qty, price: it.price }))
          : t.deal
          ? t.deal.items.map((it: any) => ({ name: it.product?.name ?? '', qty: it.qty, price: it.price }))
          : null,
      });
    }
    const closing = rows.length ? rows[rows.length - 1].balance : periodOpening;
    rows.reverse();
    return { party, opening: periodOpening, rows, balance: closing };
  }

  create(dto: CreatePartyDto) { return this.repo.create(dto); }
  update(id: string, dto: UpdatePartyDto) { return this.repo.update(id, dto); }
  remove(id: string) { return this.repo.remove(id); }
}
