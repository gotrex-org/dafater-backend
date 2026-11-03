import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CLEARANCE_EXPENSE_TYPE as CLEARANCE_TYPE } from '../clearance/clearance.repository';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { CreateManifestDto, UpdateManifestDto } from './dto/manifests.dto';

// عملية البيع الخارجي المربوطة — بنفس شكل الفاتورة المربوطة عشان الشاشات تعرضها زيها.
const DEAL_LINK = { select: { uid: true, no: true, date: true } } as const;

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
    return paginate(this.prisma.manifest, q, {
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { items: { orderBy: { id: 'asc' } }, driverTrips: { select: { arrivalDate: true } }, invoice: { select: { uid: true, no: true, date: true, kind: true } }, deal: DEAL_LINK },
    });
  }

  // شاشة الكشف بتعرض شريط السلسلة (فاتورة ← كشف ← رحلة ← تخليص)، فمحتاجة
  // uid الرحلة عشان تفتحها، والمخلّص وحركات الجمارك عشان تجمعها.
  findOne(id: string) {
    return this.prisma.manifest.findUnique({
      where: { uid: id },
      include: {
        items: { orderBy: { id: 'asc' } },
        driverTrips: {
          select: { uid: true, arrivalDate: true, driverName: true, vehicleNo: true, trailerNo: true, vehicleLabel: true, departureDate: true, agreedFreight: true },
          orderBy: { id: 'asc' },
        },
        invoice: { select: { uid: true, no: true, date: true, kind: true } }, deal: DEAL_LINK,
        clearingAgentParty: { select: { uid: true, name: true } },
        transactions: { where: { type: CLEARANCE_TYPE }, select: { credit: true } },
      },
    });
  }

  async findForParty(partyUid: string) {
    const party = await this.prisma.party.findUnique({ where: { uid: partyUid }, select: { name: true } });
    if (!party) return [];
    return this.prisma.manifest.findMany({
      where: {
        OR: [
          { clientName: party.name },
          { invoice: { party: { uid: partyUid } } },
          { deal: { client: { uid: partyUid } } },
        ],
      },
      include: { items: { orderBy: { id: 'asc' } }, driverTrips: { select: { arrivalDate: true } }, invoice: { select: { uid: true, no: true, date: true, kind: true } }, deal: DEAL_LINK },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(dto: CreateManifestDto, finalNo: string) {
    const { items, date, invoiceId, dealId, no: _no, ...rest } = dto;
    return this.prisma.manifest.create({
      data: {
        ...rest,
        no: finalNo,
        date: new Date(date),
        invoice: invoiceId ? { connect: { uid: invoiceId } } : undefined,
        deal: dealId ? { connect: { uid: dealId } } : undefined,
        items: { create: items },
      },
      include: { items: { orderBy: { id: 'asc' } }, invoice: { select: { uid: true, no: true, date: true, kind: true } }, deal: DEAL_LINK },
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
    // invoiceId بيتشال من الـ spread لأنه uid (نص) مش الـ FK الرقمي — لازم connect.
    const { items, date, invoiceId, dealId, ...rest } = dto;
    return this.prisma.manifest.update({
      where: { uid: id },
      data: {
        ...rest,
        ...(date ? { date: new Date(date) } : {}),
        // سلسلة فاضية = فك الربط بالفاتورة؛ undefined = ماتلمسش الربط.
        // الكشف بيتربط بفاتورة أو بعملية بيع خارجي — ربط واحد منهم بيفك التاني.
        ...(invoiceId !== undefined
          ? { invoice: invoiceId ? { connect: { uid: invoiceId } } : { disconnect: true } }
          : {}),
        ...(dealId !== undefined
          ? { deal: dealId ? { connect: { uid: dealId } } : { disconnect: true } }
          : invoiceId ? { deal: { disconnect: true } } : {}),
        ...(dealId && invoiceId === undefined ? { invoice: { disconnect: true } } : {}),
        ...(items !== undefined ? { items: { deleteMany: {}, createMany: { data: items } } } : {}),
      },
      include: { items: { orderBy: { id: 'asc' } }, invoice: { select: { uid: true, no: true, date: true, kind: true } }, deal: DEAL_LINK },
    });
  }

  remove(id: string) {
    return this.prisma.manifest.delete({ where: { uid: id } });
  }
}
