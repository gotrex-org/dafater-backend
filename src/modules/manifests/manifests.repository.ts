import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { CreateManifestDto, UpdateManifestDto } from './dto/manifests.dto';

@Injectable()
export class ManifestsRepository {
  constructor(private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto) {
    const where: any = {};
    if (q.search) where.OR = [
      { no: { contains: q.search } },
      { clientName: { contains: q.search, mode: 'insensitive' } },
      { driverName: { contains: q.search, mode: 'insensitive' } },
      { vehicleNo: { contains: q.search, mode: 'insensitive' } },
    ];
    if (q.from || q.to) where.date = {
      gte: q.from ? new Date(q.from) : undefined,
      lt: q.to ? new Date(new Date(q.to).getTime() + 86400000) : undefined,
    };
    return paginate(this.prisma.manifest, q, { where, orderBy: { date: 'desc' }, include: { items: true } });
  }

  findOne(id: string) {
    return this.prisma.manifest.findUnique({ where: { uid: id }, include: { items: true } });
  }

  async findForParty(partyUid: string) {
    const party = await this.prisma.party.findUnique({ where: { uid: partyUid }, select: { name: true } });
    if (!party) return [];
    return this.prisma.manifest.findMany({
      where: {
        OR: [
          { clientName: party.name },
          { invoice: { party: { uid: partyUid } } },
        ],
      },
      include: { items: true },
      orderBy: { date: 'desc' },
    });
  }

  async create(dto: CreateManifestDto, finalNo: string) {
    const { items, date, invoiceId, no: _no, ...rest } = dto;
    return this.prisma.manifest.create({
      data: {
        ...rest,
        no: finalNo,
        date: new Date(date),
        invoice: invoiceId ? { connect: { uid: invoiceId } } : undefined,
        items: { create: items },
      },
      include: { items: true },
    });
  }

  async nextNoForClient(clientName?: string): Promise<string> {
    const rows = await this.prisma.manifest.findMany({
      where: clientName ? { clientName } : {},
      select: { no: true },
    });
    const max = rows.reduce((mx, r) => {
      const n = parseInt(r.no, 10);
      return Number.isFinite(n) && n > mx ? n : mx;
    }, 0);
    return String(max + 1);
  }

  async update(id: string, dto: UpdateManifestDto) {
    const { items, date, ...rest } = dto;
    return this.prisma.manifest.update({
      where: { uid: id },
      data: {
        ...rest,
        ...(date ? { date: new Date(date) } : {}),
        ...(items !== undefined ? { items: { deleteMany: {}, createMany: { data: items } } } : {}),
      },
      include: { items: true },
    });
  }

  remove(id: string) {
    return this.prisma.manifest.delete({ where: { uid: id } });
  }
}
