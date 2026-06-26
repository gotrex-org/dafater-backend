import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAgentDto, UpdateAgentDto, EgpInDto, UsdOutDto } from './dto/forex.dto';

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
      orderBy: { date: 'desc' },
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
      const agentTx = await tx.dollarAgentTx.create({
        data: {
          date: new Date(dto.date),
          type: 'EGP_IN',
          egpAmount: dto.egpAmount,
          note: dto.note,
          agentId: agent.id,
          treasuryId,
        },
        include: { treasury: { select: { uid: true, name: true } }, party: { select: { uid: true, name: true } } },
      });
      await tx.transaction.create({
        data: {
          date: new Date(dto.date),
          type: 'دفع لوكيل صرف',
          treasuryId: treasuryId ?? null,
          cashOut: dto.egpAmount,
          note: dto.note ?? `دفع لـ ${agent.name}`,
        },
      });
      return agentTx;
    });
  }

  async usdOut(agent: { id: number }, party: { id: number; name: string }, dto: UsdOutDto) {
    return this.prisma.$transaction(async (tx) => {
      const agentTx = await tx.dollarAgentTx.create({
        data: {
          date: new Date(dto.date),
          type: 'USD_OUT',
          usdAmount: dto.usdAmount,
          exchangeRate: dto.exchangeRate,
          note: dto.note,
          agentId: agent.id,
          partyId: party.id,
        },
        include: { treasury: { select: { uid: true, name: true } }, party: { select: { uid: true, name: true } } },
      });
      await tx.transaction.create({
        data: {
          date: new Date(dto.date),
          type: 'دفع دولار لمورد',
          partyId: party.id,
          debit: dto.usdAmount,
          cashOut: dto.usdAmount * dto.exchangeRate,
          note: dto.note ?? `توريد ${dto.usdAmount} دولار — سعر ${dto.exchangeRate}`,
        },
      });
      return agentTx;
    });
  }

  findAgentTxByUid(uid: string) {
    return this.prisma.dollarAgentTx.findUnique({ where: { uid } });
  }

  deleteAgentTx(id: number) {
    return this.prisma.dollarAgentTx.delete({ where: { id } });
  }
}
