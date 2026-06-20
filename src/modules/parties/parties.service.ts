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
    result.data = result.data.map((p: any) => ({ ...p, balance: byId[p.id] ?? p.opening }));
    return result;
  }

  async findOne(id: string) {
    const party = await this.prisma.party.findUnique({ where: { id } });
    if (!party) throw new NotFoundException('Party not found');
    return { ...party, balance: await this.balances.partyBalance(id) };
  }

  /** Ledger statement: opening row + transactions with running balance. */
  async ledger(id: string) {
    const party = await this.findOne(id);
    const txns = await this.prisma.transaction.findMany({
      where: { partyId: id },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    let running = party.opening || 0;
    const rows = txns.map((t) => {
      running += (t.debit || 0) - (t.credit || 0);
      return {
        id: t.id,
        date: t.date,
        type: t.type,
        note: t.note,
        debit: t.debit,
        credit: t.credit,
        balance: running,
      };
    });
    return { party, opening: party.opening || 0, rows, balance: running };
  }

  create(dto: CreatePartyDto) {
    return this.prisma.party.create({ data: dto });
  }

  update(id: string, dto: UpdatePartyDto) {
    return this.prisma.party.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    // transactions cascade per schema; invoices use Restrict so this throws if referenced
    return this.prisma.party.delete({ where: { id } });
  }
}
