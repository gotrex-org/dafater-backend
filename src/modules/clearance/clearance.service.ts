import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BalancesService } from '../balances/balances.service';
import { deleteTransactionAndEffects } from '../../common/transaction-cascade';
import { PrismaService } from '../../prisma/prisma.service';
import { AddClearanceExpenseDto, ClearanceQueryDto, PayClearanceAgentDto } from './dto/clearance.dto';
import { CLEARANCE_EXPENSE_TYPE, CLEARANCE_PAY_TYPE, ClearanceRepository } from './clearance.repository';

@Injectable()
export class ClearanceService {
  constructor(
    private repo: ClearanceRepository,
    private balances: BalancesService,
    private prisma: PrismaService,
  ) {}

  agents() { return this.repo.listAgents(); }

  /**
   * حركات التخليص + ملخّص لكل مخلّص.
   * الرصيد بييجي من BalancesService زي أي طرف — بالسالب معناه إحنا مدينين له.
   */
  async list(q: ClearanceQueryDto) {
    let agentId: number | undefined;
    if (q.agentId) {
      const a = await this.repo.findPartyByUid(q.agentId);
      if (!a) throw new NotFoundException('المخلّص مش موجود');
      agentId = a.id;
    }
    const movements = await this.repo.listMovements({
      agentId,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
    });

    const agents = await this.repo.listAgents();
    const balances = await this.balances.partyBalanceMulti(agents.map((a) => a.id));
    const byId = new Map(agents.map((a) => [a.id, a]));

    // إجماليات الفترة لكل مخلّص: المصاريف اللي اترحّلت له واللي اتسدّد منها
    const totals = new Map<number, { expenses: number; paid: number }>();
    for (const m of movements) {
      if (!m.partyId) continue;
      const t = totals.get(m.partyId) ?? { expenses: 0, paid: 0 };
      if (m.type === CLEARANCE_EXPENSE_TYPE) t.expenses += m.credit;
      else t.paid += m.debit;
      totals.set(m.partyId, t);
    }

    return {
      movements,
      agents: agents.map((a) => ({
        uid: a.uid,
        name: a.name,
        phone: a.phone,
        expenses: totals.get(a.id)?.expenses ?? 0,
        paid: totals.get(a.id)?.paid ?? 0,
        // موجب = له عندنا (إحنا مدينين). balance من النظام موجب = هو مدين لنا،
        // فبنقلب الإشارة عشان الشاشة تقرا «المستحق للمخلّص».
        due: -(balances[a.id] ?? 0),
      })),
    };
  }

  /** مصروف جمارك على عربية — بيترحّل على حساب المخلّص. */
  async addExpense(dto: AddClearanceExpenseDto, userIntId?: number) {
    const manifest = await this.repo.findManifestByUid(dto.manifestId);
    if (!manifest) throw new NotFoundException('الكشف مش موجود');
    // كشف خارج من مكتب شحن مالوش تخليص عندنا — نفس قاعدة كشف السائق.
    if (manifest.vehicleSource !== 'OURS') {
      throw new BadRequestException(
        `كشف رقم ${manifest.no} خروجه من مكتب شحن — مالوش تخليص وجمارك عندنا`,
      );
    }

    const agent = await this.requireAgent(dto.agentId);
    const categoryId = await this.resolveCategory(dto.categoryId);

    const tx = await this.repo.createMovement({
      date: new Date(dto.date),
      type: CLEARANCE_EXPENSE_TYPE,
      partyId: agent.id,
      credit: dto.amount, // إحنا مدينين للمخلّص بالمبلغ ده
      manifestId: manifest.id,
      ...(categoryId ? { categoryId } : {}),
      note: dto.note?.trim() || `جمارك عربية ${manifest.no}`,
      ...(userIntId ? { createdById: userIntId } : {}),
    });

    // أول مصروف جمارك على الكشف بيثبّت المخلّص عليه، عشان الكشف يعرف مخلّصه
    // من غير ما المستخدم يختاره مرتين.
    if (!manifest.clearingAgentId) {
      await this.prisma.manifest.update({
        where: { id: manifest.id },
        data: { clearingAgentId: agent.id },
      });
    }
    return tx;
  }

  /** سداد للمخلّص من خزنة. */
  async pay(dto: PayClearanceAgentDto, userIntId?: number) {
    const agent = await this.requireAgent(dto.agentId);
    const treasury = await this.repo.findTreasuryByUid(dto.treasuryId);
    if (!treasury) throw new NotFoundException('الخزنة مش موجودة');

    return this.repo.createMovement({
      date: new Date(dto.date),
      type: CLEARANCE_PAY_TYPE,
      partyId: agent.id,
      debit: dto.amount, // بيقلّل اللي له عندنا
      cashOut: dto.amount,
      treasuryId: treasury.id,
      note: dto.note?.trim() || `سداد للمخلّص ${agent.name}`,
      ...(userIntId ? { createdById: userIntId } : {}),
    });
  }

  /** حذف حركة تخليص — بالكاسكيد بتاع الحركات عشان أثرها على الخزنة يتشال معاها. */
  async remove(uid: string) {
    const tx = await this.repo.findMovementByUid(uid);
    if (!tx) throw new NotFoundException('الحركة مش موجودة');
    if (tx.type !== CLEARANCE_EXPENSE_TYPE && tx.type !== CLEARANCE_PAY_TYPE) {
      throw new BadRequestException('الحركة دي مش من حركات التخليص');
    }
    await deleteTransactionAndEffects(this.prisma, tx.id);
    return { ok: true };
  }

  private async requireAgent(uid: string) {
    const agent = await this.repo.findPartyByUid(uid);
    if (!agent) throw new NotFoundException('المخلّص مش موجود');
    if (agent.role !== 'CLEARANCE') {
      throw new BadRequestException(`${agent.name} مش مسجّل كمخلّص جمركي`);
    }
    return agent;
  }

  private async resolveCategory(uid?: string) {
    if (!uid) return undefined;
    const c = await this.repo.findCategoryByUid(uid);
    if (!c) throw new NotFoundException('بند المصروف مش موجود');
    return c.id;
  }
}
