import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { deleteTransactionAndEffects } from '../../common/transaction-cascade';
import { CreateDriverDto, CreateDriverAdvanceDto, UpdateDriverDto } from './dto/drivers.dto';

@Injectable()
export class DriversRepository {
  constructor(private prisma: PrismaService) {}

  async findAll(q: PaginationQueryDto) {
    const result = await paginate(this.prisma.driver, q, {
      where: q.search ? { name: { contains: q.search, mode: 'insensitive' as const } } : {},
      orderBy: { name: 'asc' },
    });
    // إثراء بكل سائق: سلفة مصروفة + عطلات مكتسبة + متبقي السلفة (العطلات بتسدّد السلفة أوتوماتيك).
    const [advByName, delayByName] = await Promise.all([
      this.prisma.driverAdvance.groupBy({ by: ['driverName'], _sum: { amount: true } }),
      this.prisma.driverTrip.groupBy({ by: ['driverName'], _sum: { delayFee: true } }),
    ]);
    const adv = new Map(advByName.map((a) => [a.driverName, a._sum.amount || 0]));
    const dly = new Map(delayByName.map((d) => [d.driverName, d._sum.delayFee || 0]));
    (result as any).data = (result as any).data.map((d: any) => {
      const totalAdvance = adv.get(d.name) || 0;
      const delayEarned = dly.get(d.name) || 0;
      return { ...d, totalAdvance, delayEarned, outstandingAdvance: Math.max(0, totalAdvance - delayEarned) };
    });
    return result;
  }

  // ── سلف السائق ──
  async createAdvance(dto: CreateDriverAdvanceDto) {
    const treasury = await this.prisma.treasuryAccount.findUnique({ where: { uid: dto.treasuryId }, select: { id: true } });
    if (!treasury) throw new BadRequestException('اختر الخزنة');
    return this.prisma.$transaction(async (tx) => {
      const cashTx = await tx.transaction.create({
        data: { date: new Date(dto.date), type: 'سلفة سائق', cashOut: dto.amount, treasuryId: treasury.id, note: dto.note?.trim() || `سلفة (${dto.driverName})` },
      });
      return tx.driverAdvance.create({
        data: { driverName: dto.driverName, date: new Date(dto.date), amount: dto.amount, note: dto.note?.trim() || null, txId: cashTx.id },
      });
    });
  }

  listAdvances(driverName: string) {
    return this.prisma.driverAdvance.findMany({ where: { driverName }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] });
  }

  async deleteAdvance(uid: string) {
    const a = await this.prisma.driverAdvance.findUniqueOrThrow({ where: { uid } });
    if (a.txId) await deleteTransactionAndEffects(this.prisma, a.txId); // يكاسكيد لحذف السلفة نفسها
    else await this.prisma.driverAdvance.delete({ where: { uid } });
  }

  findOne(uid: string) {
    return this.prisma.driver.findUniqueOrThrow({ where: { uid } });
  }

  create(dto: CreateDriverDto) {
    return this.prisma.driver.create({ data: dto });
  }

  upsertByName(name: string, data?: { nationalId?: string; phone?: string; vehicleNo?: string; trailerNo?: string }) {
    const extra = data ? Object.fromEntries(Object.entries(data).filter(([, v]) => !!v)) : {};
    return this.prisma.driver.upsert({
      where: { name },
      create: { name, ...extra },
      update: extra,
    });
  }

  update(uid: string, dto: UpdateDriverDto) {
    return this.prisma.driver.update({ where: { uid }, data: dto });
  }

  remove(uid: string) {
    return this.prisma.driver.delete({ where: { uid } });
  }
}
