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

  remove(id: string) {
    return this.prisma.party.delete({ where: { uid: id } });
  }
}
