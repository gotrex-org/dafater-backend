import { Injectable } from '@nestjs/common';
import { PartyRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { CreatePartyDto, UpdatePartyDto } from './dto/party.dto';

const LINKED_SELECT = { id: true, uid: true, name: true, role: true } as const;

@Injectable()
export class PartiesRepository {
  constructor(private prisma: PrismaService) {}

  async findAll(q: PaginationQueryDto, role?: PartyRole, includeHidden = false) {
    const where = {
      ...(role ? { role } : {}),
      ...(includeHidden ? {} : { hidden: false }),
      ...(q.search ? { name: { contains: q.search, mode: 'insensitive' as const } } : {}),
    };
    return paginate(this.prisma.party, q, {
      where,
      orderBy: { name: 'asc' },
      include: { linkedParty: { select: LINKED_SELECT }, linkedFrom: { select: LINKED_SELECT } },
    });
  }

  findOneByUid(uid: string) {
    return this.prisma.party.findUnique({
      where: { uid },
      include: { linkedParty: { select: LINKED_SELECT }, linkedFrom: { select: LINKED_SELECT } },
    });
  }

  findRawByUid(uid: string) {
    return this.prisma.party.findUniqueOrThrow({ where: { uid }, select: { id: true, uid: true } });
  }

  async lastActivityByParty(): Promise<Record<number, Date | null>> {
    const acts = await this.prisma.transaction.groupBy({
      by: ['partyId'], _max: { date: true }, where: { partyId: { not: null } },
    });
    const lastById: Record<number, Date | null> = {};
    for (const a of acts) if (a.partyId != null) lastById[a.partyId] = a._max.date;
    return lastById;
  }

  async ledgerTransactions(partyIds: number[]) {
    return this.prisma.transaction.findMany({
      where: { partyId: { in: partyIds } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      include: {
        party: { select: { uid: true, name: true, role: true } },
        invoice: {
          select: {
            uid: true,
            manifests: {
              select: { date: true, no: true, driverTrips: { select: { arrivalDate: true } } },
              orderBy: { date: 'asc' },
              take: 1,
            },
            items: { select: { qty: true, price: true, product: { select: { name: true } } } },
          },
        },
        deal: { select: { uid: true, items: { select: { qty: true, price: true, product: { select: { name: true } } } } } },
      },
    });
  }

  async countRelated(id: number) {
    const [transactions, invoices, deals, requests] = await Promise.all([
      this.prisma.transaction.count({ where: { partyId: id } }),
      this.prisma.invoice.count({ where: { partyId: id } }),
      this.prisma.deal.count({ where: { OR: [{ clientId: id }, { supplierId: id }] } }),
      this.prisma.request.count({ where: { clientId: id } }),
    ]);
    return transactions + invoices + deals + requests;
  }

  async removeCascade(id: number) {
    // Invoice/Deal/Request are onDelete: Restrict on their party FKs (unlike
    // Transaction, which is Cascade) — delete them explicitly first. Each of
    // those cascades its own items/transactions via its own relations.
    await this.prisma.invoice.deleteMany({ where: { partyId: id } });
    await this.prisma.deal.deleteMany({ where: { OR: [{ clientId: id }, { supplierId: id }] } });
    await this.prisma.request.deleteMany({ where: { clientId: id } });
    // Remaining direct transactions (collections, adjustments, transfers…) and the
    // party itself: Transaction.party is onDelete: Cascade, so a plain delete finishes it.
    return this.prisma.party.delete({ where: { id } });
  }

  async findOrCreateDirectSaleParty() {
    const existing = await this.prisma.party.findFirst({ where: { isDirectSale: true } });
    if (existing) return existing;
    return this.prisma.party.create({
      data: { name: 'بيع مباشر', role: 'CLIENT', type: 'INVOICE', isDirectSale: true },
    });
  }

  setLink(uid: string, linkedPartyId: number) {
    return this.prisma.party.update({ where: { uid }, data: { linkedPartyId } });
  }

  clearLink(uid: string) {
    return this.prisma.party.update({ where: { uid }, data: { linkedPartyId: null } });
  }

  create(dto: CreatePartyDto) {
    return this.prisma.party.create({ data: dto });
  }

  update(id: string, dto: UpdatePartyDto) {
    return this.prisma.party.update({ where: { uid: id }, data: dto });
  }
}
