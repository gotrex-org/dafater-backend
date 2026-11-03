import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { deleteTransactionAndEffects } from '../../common/transaction-cascade';
import { repriceAgentRows } from '../../common/agent-rate';
import { CreateAgentDto, UpdateAgentDto, EgpInDto, UsdOutDto, SettleDto, UpdateAgentTxDto } from './dto/forex.dto';

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
          // مفيش cashOut هنا — الجنيه خرج بالفعل من الخزينة في خطوة EGP_IN. نختم سعر الصرف بس
          // عشان متوسط سعر صرف المورد المرجّح يحسبها صح.
          exchangeRate: dto.exchangeRate,
          note: dto.note ?? `توريد ${dto.usdAmount} دولار — سعر ${dto.exchangeRate}`,
        },
      });
      const row = await tx.dollarAgentTx.create({
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
      await repriceAgentRows(tx);
      return row;
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

  // تعديل حركة وكيل ومعها حركة Transaction المرتبطة (الخزنة / حساب المورد) في نفس
  // العملية، فرصيد الوكيل والخزنة وكشف المورد ودورة الدولار يفضلوا متطابقين.
  async updateAgentTx(id: number, dto: UpdateAgentTxDto, treasuryId: number | null | undefined, partyId: number | undefined) {
    return this.prisma.$transaction(async (tx) => {
      const cur = await tx.dollarAgentTx.findUniqueOrThrow({ where: { id }, include: { agent: { select: { name: true } } } });
      const date = dto.date !== undefined ? new Date(dto.date) : cur.date;
      const note = dto.note !== undefined ? (dto.note.trim() || null) : cur.note;
      const tId = treasuryId !== undefined ? treasuryId : cur.treasuryId;
      const a: any = { date, note };
      const t: any = { date };

      if (cur.type === 'EGP_IN') {
        const egp = dto.egpAmount ?? cur.egpAmount;
        Object.assign(a, { egpAmount: egp, treasuryId: tId });
        Object.assign(t, { cashOut: egp, treasuryId: tId, note: note ?? `دفع لـ ${cur.agent.name}` });
      } else if (cur.type === 'USD_OUT') {
        const usd = dto.usdAmount ?? cur.usdAmount;
        const rate = dto.exchangeRate ?? cur.exchangeRate;
        const pId = partyId ?? cur.partyId;
        Object.assign(a, { usdAmount: usd, exchangeRate: rate, partyId: pId });
        Object.assign(t, { debit: usd, exchangeRate: rate, partyId: pId, note: note ?? `توريد ${usd} دولار — سعر ${rate}` });
      } else {
        // SETTLE: موجب = استرداد من الوكيل (داخل الخزنة)، سالب = دفع للوكيل (خارج الخزنة)
        const dir = dto.direction ?? (cur.egpAmount >= 0 ? 'in' : 'out');
        const egp = dto.egpAmount ?? Math.abs(cur.egpAmount);
        Object.assign(a, { egpAmount: dir === 'in' ? egp : -egp, treasuryId: tId });
        Object.assign(t, {
          cashIn: dir === 'in' ? egp : 0, cashOut: dir === 'out' ? egp : 0,
          treasuryId: tId, note: note ?? `تسوية ${cur.agent.name}`,
        });
        // تسوية قديمة بدون خزنة واتحدّدت لها خزنة الآن → تُنشأ حركة الخزنة.
        if (!cur.txId && tId) {
          const created = await tx.transaction.create({ data: { ...t, type: 'تسوية وكيل صرف' } });
          a.txId = created.id;
        }
      }

      if (cur.txId) await tx.transaction.update({ where: { id: cur.txId }, data: t });
      const row = await tx.dollarAgentTx.update({
        where: { id },
        data: a,
        include: { treasury: { select: { uid: true, name: true } }, party: { select: { uid: true, name: true } } },
      });
      if (cur.type === 'USD_OUT') await repriceAgentRows(tx);
      return row;
    });
  }

  async deleteAgentTx(id: number) {
    const agentTx = await this.prisma.dollarAgentTx.findUniqueOrThrow({ where: { id } });
    if (agentTx.txId) {
      // cascades to the paired Transaction, which in turn deletes this agent tx
      await deleteTransactionAndEffects(this.prisma, agentTx.txId);
    } else {
      await this.prisma.dollarAgentTx.delete({ where: { id } });
    }
    if (agentTx.type === 'USD_OUT') await repriceAgentRows(this.prisma);
  }
}
