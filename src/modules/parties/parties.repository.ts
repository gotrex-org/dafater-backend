import { Injectable } from '@nestjs/common';
import { PartyRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { CreatePartyDto, UpdatePartyDto } from './dto/party.dto';

@Injectable()
export class PartiesRepository {
  constructor(private prisma: PrismaService) {}

  async findAll(q: PaginationQueryDto, role?: PartyRole, includeHidden = false) {
    const where = {
      ...(role ? { role } : {}),
      ...(includeHidden ? {} : { hidden: false }),
      ...(q.search ? { name: { contains: q.search, mode: 'insensitive' as const } } : {}),
    };
    return paginate(this.prisma.party, q, { where, orderBy: { name: 'asc' } });
  }

  findOneByUid(uid: string) {
    return this.prisma.party.findUnique({ where: { uid } });
  }

  async lastActivityByParty(): Promise<Record<number, Date | null>> {
    const acts = await this.prisma.transaction.groupBy({
      by: ['partyId'], _max: { date: true }, where: { partyId: { not: null } },
    });
    const lastById: Record<number, Date | null> = {};
    for (const a of acts) if (a.partyId != null) lastById[a.partyId] = a._max.date;
    return lastById;
  }

  async ledgerTransactions(partyId: number) {
    return this.prisma.transaction.findMany({
      where: { partyId },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      include: {
        invoice: { select: { uid: true, items: { select: { qty: true, price: true, product: { select: { name: true } } } } } },
        deal: { select: { uid: true, items: { select: { qty: true, price: true, product: { select: { name: true } } } } } },
      },
    });
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
