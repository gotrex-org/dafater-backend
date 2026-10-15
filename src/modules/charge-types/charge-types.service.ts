import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChargeTypeDto, UpdateChargeTypeDto } from './dto/charge-types.dto';

/** بنود الشحن على الفواتير (نولون/تحميل/شفتنة…) — قائمة تتعدّل من الإعدادات. */
@Injectable()
export class ChargeTypesService {
  constructor(private prisma: PrismaService) {}

  findAll(includeHidden = false) {
    return this.prisma.chargeType.findMany({
      where: includeHidden ? {} : { hidden: false },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { charges: true } } },
    });
  }

  async create(dto: ChargeTypeDto) {
    const name = dto.name.trim();
    const existing = await this.prisma.chargeType.findUnique({ where: { name } });
    if (existing) {
      // بند مؤرشف بنفس الاسم يرجع نشط بدل ما يتكرر.
      if (existing.hidden) return this.prisma.chargeType.update({ where: { id: existing.id }, data: { hidden: false } });
      throw new ConflictException('يوجد بند بنفس الاسم');
    }
    const max = await this.prisma.chargeType.aggregate({ _max: { sortOrder: true } });
    return this.prisma.chargeType.create({
      data: { name, sortOrder: dto.sortOrder ?? (max._max.sortOrder ?? 0) + 1 },
    });
  }

  async update(uid: string, dto: UpdateChargeTypeDto) {
    const ct = await this.prisma.chargeType.findUnique({ where: { uid } });
    if (!ct) throw new NotFoundException('البند غير موجود');
    if (dto.name !== undefined) {
      const dup = await this.prisma.chargeType.findFirst({ where: { name: dto.name.trim(), NOT: { id: ct.id } } });
      if (dup) throw new ConflictException('يوجد بند بنفس الاسم');
    }
    return this.prisma.chargeType.update({
      where: { id: ct.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.hidden !== undefined ? { hidden: dto.hidden } : {}),
      },
    });
  }

  /** حذف — البند المستخدم في فواتير يتأرشف بدل الحذف، لأن الفواتير القديمة تشير إليه. */
  async remove(uid: string) {
    const ct = await this.prisma.chargeType.findUnique({ where: { uid }, include: { _count: { select: { charges: true } } } });
    if (!ct) throw new NotFoundException('البند غير موجود');
    if (ct._count.charges > 0) {
      await this.prisma.chargeType.update({ where: { id: ct.id }, data: { hidden: true } });
      return { ok: true, archived: true };
    }
    await this.prisma.chargeType.delete({ where: { id: ct.id } });
    return { ok: true, archived: false };
  }
}
