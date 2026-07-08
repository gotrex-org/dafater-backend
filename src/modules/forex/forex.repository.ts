import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { deleteTransactionAndEffects } from '../../common/transaction-cascade';
import { CreateAgentDto, UpdateAgentDto, EgpInDto, UsdOutDto, SettleDto } from './dto/forex.dto';

@Injectable()
export class ForexRepository {
  constructor(private prisma: PrismaService) {}

  findAllAgents() {
    return this.prisma.dollarAgent.findMany({ orderBy: { name: 'asc' } });
  }

  findAgentByUid(uid: string) {
    return this.prisma.dollarAgent.findUnique({ where: { uid } });
  }

  findAgentTxs(agentId: number) {
    return this.prisma.dollarAgentTx.findMany({
      where: { agentId },
      include: {
        treasury: { select: { uid: true, name: true } },
        party: { select: { uid: true, name: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  findAgentTxsByIdSimple(agentId: number) {
    return this.prisma.dollarAgentTx.findMany({ where: { agentId } });
  }

  createAgent(dto: CreateAgentDto) {
    return this.prisma.dollarAgent.create({ data: dto });
  }

  updateAgent(id: number, dto: UpdateAgentDto) {
    return this.prisma.dollarAgent.update({ where: { id }, data: dto });
  }

  removeAgent(id: number) {
    return this.prisma.dollarAgent.delete({ where: { id } });
  }

  findTreasuryByUid(uid: string) {
    return this.prisma.treasuryAccount.findUnique({ where: { uid }, select: { id: true, uid: true } });
  }

  findPartyByUid(uid: string) {
    return this.prisma.party.findUnique({ where: { uid }, select: { id: true, name: true, role: true } });
  }

  async egpIn(agent: { id: number; name: string }, treasuryId: number | undefined, dto: EgpInDto) {
    return this.prisma.$transaction(async (tx) => {
      const createdTx = await tx.transaction.create({
        data: {
          date: new Date(dto.date),
          type: 'دفع لوكيل صرف',
          treasuryId: treasuryId ?? null,
          cashOut: dto.egpAmount,
          note: dto.note ?? `دفع لـ ${agent.name}`,
        },
      });
      return tx.dollarAgentTx.create({
        data: {
          date: new Date(dto.date),
          type: 'EGP_IN',
          egpAmount: dto.egpAmount,
          note: dto.note,
          agentId: agent.id,
          treasuryId,
          txId: createdTx.id,
        },
        include: { treasury: { select: { uid: true, name: true } }, party: { select: { uid: true, name: true } } },
      });
    });
  }

  async usdOut(agent: { id: number }, party: { id: number; name: string }, dto: UsdOutDto) {
    return this.prisma.$transaction(async (tx) => {
      const createdTx = await tx.transaction.create({
        data: {
          date: new Date(dto.date),
          type: 'دفع دولار لمورد',
          partyId: party.id,
          debit: dto.usdAmount,
          cashOut: dto.usdAmount * dto.exchangeRate,
          note: dto.note ?? `توريد ${dto.usdAmount} دولار — سعر ${dto.exchangeRate}`,
        },
      });
      return tx.dollarAgentTx.create({
        data: {
          date: new Date(dto.date),
          type: 'USD_OUT',
          usdAmount: dto.usdAmount,
          exchangeRate: dto.exchangeRate,
          note: dto.note,
          agentId: agent.id,
          partyId: party.id,
          txId: createdTx.id,
        },
        include: { treasury: { select: { uid: true, name: true } }, party: { select: { uid: true, name: true } } },
      });
    });
  }

  async settle(agent: { id: number; name: string }, treasuryId: number | undefined, dto: SettleDto) {
    // direction 'in'  = they pay us back  → store positive egpAmount, treasury cashIn
    // direction 'out' = we pay them       → store negative egpAmount, treasury cashOut
    const signed = dto.direction === 'in' ? dto.egpAmount : -dto.egpAmount;
    return this.prisma.$transaction(async (tx) => {
      const createdTx = treasuryId ? await tx.transaction.create({
        data: {
          date: new Date(dto.date),
          type: 'تسوية وكيل صرف',
          treasuryId,
          cashIn: dto.direction === 'in' ? dto.egpAmount : 0,
          cashOut: dto.direction === 'out' ? dto.egpAmount : 0,
          note: dto.note ?? `تسوية ${agent.name}`,
        },
      }) : null;
      return tx.dollarAgentTx.create({
        data: {
          date: new Date(dto.date),
          type: 'SETTLE',
          egpAmount: signed,
          note: dto.note,
          agentId: agent.id,
          treasuryId,
          txId: createdTx?.id ?? null,
        },
        include: { treasury: { select: { uid: true, name: true } }, party: { select: { uid: true, name: true } } },
      });
    });
  }

  findAgentTxByUid(uid: string) {
    return this.prisma.dollarAgentTx.findUnique({ where: { uid } });
  }

  async deleteAgentTx(id: number) {
    const agentTx = await this.prisma.dollarAgentTx.findUniqueOrThrow({ where: { id } });
    if (agentTx.txId) {
      // cascades to the paired Transaction, which in turn deletes this agent tx
      await deleteTransactionAndEffects(this.prisma, agentTx.txId);
    } else {
      await this.prisma.dollarAgentTx.delete({ where: { id } });
    }
  }
}
