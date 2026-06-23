import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/pagination';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateManifestDto } from './dto/manifests.dto';

@Injectable()
export class ManifestsService {
  constructor(private prisma: PrismaService) {}
  findAll(q: PaginationQueryDto) {
    return paginate(this.prisma.manifest, q, { orderBy: { date: 'desc' }, include: { items: true } });
  }
  findOne(id: string) {
    return this.prisma.manifest.findUnique({ where: { uid: id }, include: { items: true } });
  }
  async create(dto: CreateManifestDto) {
    const { items, date, invoiceId, no, ...rest } = dto;
    const finalNo = no?.trim() || (await this.nextNo());
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

  /** Next sequential manifest number: max existing numeric `no` + 1. */
  private async nextNo(): Promise<string> {
    const rows = await this.prisma.manifest.findMany({ select: { no: true } });
    const max = rows.reduce((mx, r) => {
      const n = parseInt(r.no, 10);
      return Number.isFinite(n) && n > mx ? n : mx;
    }, 0);
    return String(max + 1);
  }
  remove(id: string) {
    return this.prisma.manifest.delete({ where: { uid: id } });
  }
}
