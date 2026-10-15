import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { computeVehicleProfits } from '../../common/vehicle-profit';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateManifestDto, UpdateManifestDto } from './dto/manifests.dto';
import { ManifestsRepository } from './manifests.repository';
import { DriversService } from '../drivers/drivers.service';

@Injectable()
export class ManifestsService {
  constructor(
    private repo: ManifestsRepository,
    private driversService: DriversService,
    private prisma: PrismaService,
  ) {}

  async shipping(uid: string) {
    const [row] = await computeVehicleProfits(this.prisma, { uid });
    if (!row) throw new NotFoundException('الكشف غير موجود');
    return row;
  }

  /** ربط/فك بند شحن من فاتورة العربية بالعربية. */
  async assignCharge(uid: string, chargeUid: string, assign: boolean) {
    const m = await this.prisma.manifest.findUnique({ where: { uid }, select: { id: true, invoiceId: true } });
    if (!m) throw new NotFoundException('الكشف غير موجود');
    const c = await this.prisma.invoiceCharge.findUnique({ where: { uid: chargeUid }, select: { id: true, invoiceId: true, manifestId: true } });
    if (!c) throw new NotFoundException('البند غير موجود');
    if (c.invoiceId !== m.invoiceId) throw new BadRequestException('البند ليس على فاتورة هذه العربية');
    if (!assign && c.manifestId !== m.id) throw new BadRequestException('البند غير مربوط بهذه العربية');
    await this.prisma.invoiceCharge.update({ where: { id: c.id }, data: { manifestId: assign ? m.id : null } });
    return { ok: true };
  }

  findAll(q: PaginationQueryDto) { return this.repo.findAll(q); }
  /**
   * الكشف + إجمالي تخليصه. بنجمع حركات الجمارك هنا ونشيل الحركات الخام من الرد —
   * الشاشة محتاجة الإجمالي بس، مش كل حركة.
   */
  async findOne(id: string) {
    const m: any = await this.repo.findOne(id);
    if (!m) return m;
    const { transactions, clearingAgentParty, ...rest } = m;
    const total = (transactions ?? []).reduce((s: number, t: any) => s + (t.credit || 0), 0);
    return {
      ...rest,
      clearance: total || clearingAgentParty
        ? { total, agent: clearingAgentParty ?? null }
        : null,
    };
  }
  findForParty(partyUid: string) { return this.repo.findForParty(partyUid); }

  async create(dto: CreateManifestDto) {
    const finalNo = dto.no?.trim() || (await this.repo.nextNoForClient(dto.clientName));
    const manifest = await this.repo.create(dto, finalNo);
    if (dto.driverName?.trim()) {
      this.driversService.upsertByName(dto.driverName.trim(), {
        nationalId: dto.driverNID || undefined,
        phone: dto.driverPhone || undefined,
        vehicleNo: dto.vehicleNo || undefined,
        vehicleLabel: dto.vehicleLabel || undefined,
        trailerNo: dto.trailerNo || undefined,
      }).catch(() => {});
    }
    return manifest;
  }

  async peekNextNo(clientName: string): Promise<{ no: string }> {
    return { no: await this.repo.nextNoForClient(clientName) };
  }

  update(id: string, dto: UpdateManifestDto) { return this.repo.update(id, dto); }
  remove(id: string) { return this.repo.remove(id); }
}
