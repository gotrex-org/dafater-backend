import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { CreateDealDto, DealCommissionDto } from './dto/deals.dto';

const DEAL_INCLUDE = { client: true, supplier: true, treasury: true, items: { include: { product: true } } } as const;

@Injectable()
export class DealsRepository {
  constructor(private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto) {
    const where: any = {};
    if (q.search) where.OR = [
      { no: { contains: q.search } },
      { client: { name: { contains: q.search, mode: 'insensitive' } } },
      { supplier: { name: { contains: q.search, mode: 'insensitive' } } },
    ];
    if (q.from || q.to) where.date = {
      gte: q.from ? new Date(q.from) : undefined,
      lt: q.to ? new Date(new Date(q.to).getTime() + 86400000) : undefined,
    };
    return paginate(this.prisma.deal, q, { where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], include: DEAL_INCLUDE });
  }

  findOne(uid: string) {
    return this.prisma.deal.findUniqueOrThrow({ where: { uid }, include: DEAL_INCLUDE });
  }

  async create(dto: CreateDealDto) {
    return this.prisma.$transaction(async (tx) => {
      const { client, supplier, treasury, commissionParty, productIdByUid, no } = await this.resolve(tx, dto, null);
      const { date, paidIn, paidOut, nawlon } = this.amounts(dto);
      const sellTotal = dto.items.reduce((s, it) => s + it.qty * it.price, 0);
      const buyTotal  = dto.items.reduce((s, it) => s + it.qty * (it.buyPrice || 0), 0);

      const deal = await tx.deal.create({
        data: {
          no, date, clientId: client.id, supplierId: supplier.id,
          paidIn, paidOut, nawlon, treasuryId: treasury?.id ?? null, note: dto.note,
          items: { create: dto.items.map((it) => ({ productId: productIdByUid.get(it.productId)!, qty: it.qty, price: it.price, buyPrice: it.buyPrice || 0 })) },
        },
      });

      await tx.transaction.createMany({ data: this.txns(deal.id, { client, supplier, treasury, commissionParty, date, no, sellTotal, buyTotal, paidIn, paidOut, nawlon, dto }) });
      return tx.deal.findUnique({ where: { id: deal.id }, include: DEAL_INCLUDE });
    });
  }

  async update(uid: string, dto: CreateDealDto) {
    const existing = await this.prisma.deal.findUniqueOrThrow({ where: { uid }, select: { id: true, no: true } });
    const dealId = existing.id;

    return this.prisma.$transaction(async (tx) => {
      const { client, supplier, treasury, commissionParty, productIdByUid, no } = await this.resolve(tx, dto, existing.no);
      const { date, paidIn, paidOut, nawlon } = this.amounts(dto);
      const sellTotal = dto.items.reduce((s, it) => s + it.qty * it.price, 0);
      const buyTotal  = dto.items.reduce((s, it) => s + it.qty * (it.buyPrice || 0), 0);

      await tx.transaction.deleteMany({ where: { dealId } });
      await tx.dealItem.deleteMany({ where: { dealId } });

      await tx.deal.update({
        where: { id: dealId },
        data: {
          no, date, clientId: client.id, supplierId: supplier.id,
          paidIn, paidOut, nawlon, treasuryId: treasury?.id ?? null, note: dto.note,
          items: { create: dto.items.map((it) => ({ productId: productIdByUid.get(it.productId)!, qty: it.qty, price: it.price, buyPrice: it.buyPrice || 0 })) },
        },
      });

      await tx.transaction.createMany({ data: this.txns(dealId, { client, supplier, treasury, commissionParty, date, no, sellTotal, buyTotal, paidIn, paidOut, nawlon, dto }) });
      return tx.deal.findUnique({ where: { id: dealId }, include: DEAL_INCLUDE });
    });
  }

  async updateCommission(uid: string, dto: DealCommissionDto) {
    const deal = await this.prisma.deal.findUniqueOrThrow({ where: { uid }, select: { id: true, date: true, no: true } });
    return this.prisma.$transaction(async (tx) => {
      await tx.transaction.deleteMany({ where: { dealId: deal.id, type: 'commission' } });
      if (dto.commissionAmount && dto.commissionAmount > 0 && dto.commissionPartyId) {
        const cp = await tx.party.findUniqueOrThrow({ where: { uid: dto.commissionPartyId }, select: { id: true } });
        await tx.transaction.create({
          data: { date: deal.date, type: 'commission', partyId: cp.id, credit: dto.commissionAmount, note: `commission صفقة #${deal.no}`, dealId: deal.id },
        });
      }
    });
  }

  remove(id: string) {
    return this.prisma.deal.delete({ where: { uid: id } });
  }

  async peekNextNo(clientUid: string): Promise<{ no: string }> {
    const client = await this.prisma.party.findUnique({ where: { uid: clientUid }, select: { id: true } });
    if (!client) return { no: '1' };
    const rows = await this.prisma.deal.findMany({ where: { clientId: client.id }, select: { no: true } });
    const max = rows.reduce((mx, r) => {
      const n = parseInt(r.no, 10);
      return Number.isFinite(n) && n > mx ? n : mx;
    }, 0);
    return { no: String(max + 1) };
  }

  private async resolve(tx: Prisma.TransactionClient, dto: CreateDealDto, fallbackNo: string | null) {
    const [client, supplier, treasury] = await Promise.all([
      tx.party.findUniqueOrThrow({ where: { uid: dto.clientId }, select: { id: true } }),
      tx.party.findUniqueOrThrow({ where: { uid: dto.supplierId }, select: { id: true } }),
      dto.treasuryId
        ? tx.treasuryAccount.findUniqueOrThrow({ where: { uid: dto.treasuryId }, select: { id: true } })
        : Promise.resolve(null),
    ]);
    const commissionParty = dto.commissionPartyId
      ? await tx.party.findUniqueOrThrow({ where: { uid: dto.commissionPartyId }, select: { id: true } })
      : null;
    const products = await tx.product.findMany({
      where: { uid: { in: dto.items.map((it) => it.productId) } },
      select: { id: true, uid: true },
    });
    const productIdByUid = new Map(products.map((p) => [p.uid, p.id]));
    const no = dto.no?.trim() || fallbackNo || (await this.nextNo(tx, client.id));
    return { client, supplier, treasury, commissionParty, productIdByUid, no };
  }

  private amounts(dto: CreateDealDto) {
    return { date: new Date(dto.date), paidIn: dto.paidIn || 0, paidOut: dto.paidOut || 0, nawlon: dto.nawlon || 0 };
  }

  private async nextNo(tx: Prisma.TransactionClient, clientId?: number): Promise<string> {
    const where = clientId ? { clientId } : {};
    const rows = await tx.deal.findMany({ where, select: { no: true } });
    const max = rows.reduce((mx, r) => {
      const n = parseInt(r.no, 10);
      return Number.isFinite(n) && n > mx ? n : mx;
    }, 0);
    return String(max + 1);
  }

  private txns(
    dealId: number,
    p: {
      client: { id: number }; supplier: { id: number }; treasury: { id: number } | null;
      commissionParty: { id: number } | null; date: Date; no: string;
      sellTotal: number; buyTotal: number; paidIn: number; paidOut: number; nawlon: number;
      dto: CreateDealDto;
    },
  ): Prisma.TransactionCreateManyInput[] {
    const { client, supplier, treasury, commissionParty, date, no, sellTotal, buyTotal, paidIn, paidOut, nawlon, dto } = p;
    const txns: Prisma.TransactionCreateManyInput[] = [
      { date, type: 'بيع خارجي', partyId: client.id, debit: sellTotal, note: `بيع خارجي #${no}`, dealId },
      { date, type: 'شراء خارجي', partyId: supplier.id, credit: buyTotal, note: `شراء خارجي #${no}`, dealId },
    ];
    if (paidIn > 0) txns.push({ date, type: 'تحصيل', partyId: client.id, treasuryId: treasury?.id ?? null, credit: paidIn, cashIn: paidIn, dealId });
    if (paidOut > 0) txns.push({ date, type: 'دفعة لمورد', partyId: supplier.id, treasuryId: treasury?.id ?? null, debit: paidOut, cashOut: paidOut, dealId });
    if (dto.commissionAmount && dto.commissionAmount > 0 && commissionParty) txns.push({ date, type: 'commission', partyId: commissionParty.id, credit: dto.commissionAmount, note: `commission صفقة #${no}`, dealId });
    if (nawlon > 0) txns.push({ date, type: 'ناولون', partyId: client.id, debit: nawlon, note: `ناولون صفقة #${no}`, dealId });
    return txns;
  }
}
