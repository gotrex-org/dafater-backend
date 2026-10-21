import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Currency, Prisma } from '@prisma/client';
import { deleteTransactionAndEffects } from '../../common/transaction-cascade';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AddCashClearanceDto, AddClearanceExpenseDto, ClearanceAgentDto, ClearanceQueryDto,
  PayClearanceAgentDto, UpdateClearanceAgentDto, UpdateClearanceMovementDto,
} from './dto/clearance.dto';
import { CLEARANCE_EXPENSE_TYPE, CLEARANCE_PAY_TYPE, ClearanceRepository } from './clearance.repository';

@Injectable()
export class ClearanceService {
  constructor(
    private repo: ClearanceRepository,
    private prisma: PrismaService,
  ) {}

  async agents(includeArchived = false) {
    const agents = await this.repo.listAgents(includeArchived);
    return agents.map(({ clearanceSupplier, ...a }) => ({ ...a, supplier: clearanceSupplier }));
  }

  // ───────────────────────────── المكاتب ─────────────────────────────

  /** مكتب تخليص جديد — طرف بدور CLEARANCE ليه حساب جاري. */
  async createAgent(dto: ClearanceAgentDto) {
    const name = dto.name.trim();
    const dup = await this.prisma.party.findFirst({ where: { name, role: 'CLEARANCE' } });
    if (dup) throw new ConflictException(dup.hidden ? 'يوجد مكتب مؤرشف بنفس الاسم. يمكن استعادته من المكاتب المؤرشفة' : 'يوجد مكتب تخليص بنفس الاسم');
    return this.repo.createAgent({
      name, phone: dto.phone?.trim() || null, note: dto.note?.trim() || null,
      clearanceSupplierId: await this.resolveSupplier(dto.supplierId, 'EGP'),
    });
  }

  async updateAgent(uid: string, dto: UpdateClearanceAgentDto) {
    const agent = await this.requireAgent(uid, true);
    if (dto.name !== undefined) {
      const dup = await this.prisma.party.findFirst({ where: { name: dto.name.trim(), role: 'CLEARANCE', NOT: { id: agent.id } } });
      if (dup) throw new ConflictException('يوجد مكتب تخليص بنفس الاسم');
    }
    return this.repo.updateAgent(agent.id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
      ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
      ...(dto.supplierId !== undefined ? { clearanceSupplierId: await this.resolveSupplier(dto.supplierId, agent.currency) } : {}),
    });
  }

  /** أرشفة/استعادة — المؤرشف بيختفي من القوايم والاختيارات، وحساباته زي ما هي. */
  async archiveAgent(uid: string, archived: boolean) {
    const agent = await this.requireAgent(uid, true);
    return this.repo.updateAgent(agent.id, { hidden: archived });
  }

  /** حذف — للمكتب اللي مالوش أي حركة بس. غير كده الأرشفة. */
  async deleteAgent(uid: string) {
    const agent = await this.requireAgent(uid, true);
    const n = await this.repo.countAgentTransactions(agent.id);
    if (n > 0 || (agent.opening || 0) !== 0) {
      throw new ConflictException(`المكتب عليه ${n} حركة، لذلك لا يمكن حذفه. يمكن أرشفته بدلاً من الحذف`);
    }
    await this.repo.deleteAgent(agent.id);
    return { ok: true };
  }

  // ───────────────────────────── القوائم والكشف ─────────────────────────────

  /**
   * حركات التخليص + ملخّص لكل مكتب. `due` موجب = المستحق للمكتب علينا.
   * رصيد الطرف في النظام موجب = هو مدين لنا، فبنقلب الإشارة.
   */
  async list(q: ClearanceQueryDto) {
    let agentId: number | undefined;
    if (q.agentId) agentId = (await this.requireAgent(q.agentId, true)).id;
    const movements = await this.repo.listMovements({
      agentId,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
    });

    const agents = await this.repo.listAgents(q.archived === '1');
    const net = await this.repo.netByParty(agents.map((a) => a.id));

    // إجماليات الفترة لكل مكتب: اللي اترحّل له واللي اتدفع له
    const totals = new Map<number, { expenses: number; paid: number }>();
    for (const m of movements) {
      const id = m.clearanceAgentId ?? m.partyId;
      if (!id) continue;
      const t = totals.get(id) ?? { expenses: 0, paid: 0 };
      if (m.type === CLEARANCE_EXPENSE_TYPE) t.expenses += m.credit;
      else t.paid += m.debit;
      totals.set(id, t);
    }

    return {
      movements,
      agents: agents.map((a) => ({
        uid: a.uid,
        name: a.name,
        phone: a.phone,
        note: a.note,
        hidden: a.hidden,
        supplier: a.clearanceSupplier,
        expenses: totals.get(a.id)?.expenses ?? 0,
        paid: totals.get(a.id)?.paid ?? 0,
        due: -((a.opening || 0) + (net.get(a.id) ?? 0)),
      })),
    };
  }

  /**
   * كشف حساب مكتب: الرصيد المرحّل قبل الفترة، وكل حركة برصيدها بعدها.
   * الرصيد هنا = المستحق للمكتب (له − عليه).
   */
  async statement(uid: string, q: ClearanceQueryDto) {
    const agent = await this.requireAgent(uid, true);
    const supplier = agent.clearanceSupplierId
      ? await this.prisma.party.findUnique({ where: { id: agent.clearanceSupplierId }, select: { uid: true, name: true } })
      : null;
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    const before = from ? await this.repo.netBefore(agent.id, from) : 0;
    let balance = -((agent.opening || 0) + before);
    const opening = balance;
    const rows = (await this.repo.statementRows(agent.id, from, to)).map((t) => {
      balance += (t.credit || 0) - (t.debit || 0);
      return { ...t, balance };
    });
    return {
      agent: { uid: agent.uid, name: agent.name, phone: agent.phone, note: agent.note, hidden: agent.hidden, supplier },
      opening,
      rows: rows.reverse(),
      totals: {
        expenses: rows.reduce((s, r) => s + (r.credit || 0), 0),
        paid: rows.reduce((s, r) => s + (r.debit || 0), 0),
      },
      closing: balance,
    };
  }

  // ───────────────────────────── الحركات ─────────────────────────────

  /**
   * تخليص عربية على حساب المكتب — المبلغ بيزوّد المستحق للمكتب. لو المكتب مربوط
   * بمورد، الحركة بتترحّل على حساب المورد.
   */
  async addExpense(dto: AddClearanceExpenseDto, userIntId?: number) {
    const { manifest, agent, ledger, categoryId } = await this.expenseParts(dto);
    const tx = await this.repo.createMovement({
      ...this.expenseRow(dto, manifest, agent, ledger, categoryId),
      ...(userIntId ? { createdById: userIntId } : {}),
    });
    await this.pinAgentOnManifest(manifest, agent.id);
    return tx;
  }

  /**
   * تخليص نقدي على عربية — بيتدفع من الخزنة على طول. مصروف على حساب المكتب + دفعة له
   * بنفس المبلغ في نفس اللحظة، فرصيد المكتب ثابت والعربية بتشيل التكلفة.
   */
  async addCashExpense(dto: AddCashClearanceDto, userIntId?: number) {
    const { manifest, agent, ledger, categoryId } = await this.expenseParts(dto);
    const treasury = await this.requireTreasury(dto.treasuryId);
    // المبلغ بعملة الحساب المرحّل عليه؛ الخزنة بتنقص بعملتها.
    const cashOut = this.fromLedger(dto.amount, ledger.currency, treasury.currency, dto.rate);
    const groupId = crypto.randomUUID();
    const by = userIntId ? { createdById: userIntId } : {};
    const [exp] = await this.repo.createMovements([
      { ...this.expenseRow(dto, manifest, agent, ledger, categoryId), groupId, ...by },
      {
        date: new Date(dto.date), type: CLEARANCE_PAY_TYPE, partyId: ledger.id, clearanceAgentId: agent.id,
        debit: dto.amount, cashOut, treasuryId: treasury.id,
        ...(cashOut !== dto.amount && dto.rate ? { exchangeRate: dto.rate } : {}),
        note: `تخليص نقدي كشف ${manifest.no}${this.viaAgent(agent, ledger)}`,
        groupId, ...by,
      },
    ]);
    await this.pinAgentOnManifest(manifest, agent.id);
    return exp;
  }

  /**
   * دفعة لمكتب التخليص من خزنة جنيه أو دولار. المبلغ بعملة الخزنة. لو المكتب مربوط
   * بمورد، الدفعة بتنزل من حساب المورد.
   */
  async pay(dto: PayClearanceAgentDto, userIntId?: number) {
    const agent = await this.requireAgent(dto.agentId);
    const ledgerParty = await this.ledgerOf(agent);
    const treasury = await this.requireTreasury(dto.treasuryId);
    const ledger = this.toLedger(dto.amount, treasury.currency, ledgerParty.currency, dto.rate);
    return this.repo.createMovement({
      date: new Date(dto.date),
      type: CLEARANCE_PAY_TYPE,
      partyId: ledgerParty.id,
      clearanceAgentId: agent.id,
      debit: ledger, // بيقلّل المستحق للمكتب
      cashOut: dto.amount,
      treasuryId: treasury.id,
      ...(ledger !== dto.amount && dto.rate ? { exchangeRate: dto.rate } : {}),
      note: dto.note?.trim() || `دفعة لمكتب التخليص ${agent.name}${ledgerParty.id !== agent.id ? ` (حساب المورد ${ledgerParty.name})` : ''}`,
      ...(userIntId ? { createdById: userIntId } : {}),
    });
  }

  /**
   * تعديل حركة تخليص. التخليص النقدي (مصروف + دفعة بنفس groupId) بيتعدّل برجليه مع
   * بعض: نفس التاريخ والمكتب والمبلغ. أي حقل مش مبعوت بيفضل زي ما هو.
   */
  async updateMovement(uid: string, dto: UpdateClearanceMovementDto) {
    const tx = await this.repo.findMovementByUid(uid);
    if (!tx) throw new NotFoundException('الحركة غير موجودة');
    this.assertClearanceType(tx.type);

    const legs = tx.groupId ? await this.repo.findGroup(tx.groupId) : [tx];
    const exp = legs.find((t) => t.type === CLEARANCE_EXPENSE_TYPE);
    const pay = legs.find((t) => t.type === CLEARANCE_PAY_TYPE);

    // تغيير المكتب بيرحّل الحركة على حسابه الحالي (المكتب أو المورد المربوط به).
    // من غير تغيير، الحركة بتفضل على الحساب اللي اترحّلت عليه.
    const currentAgentId = tx.clearanceAgentId ?? tx.partyId!;
    const picked = dto.agentId ? await this.requireAgent(dto.agentId, true) : null;
    const newAgent = picked && picked.id !== currentAgentId ? picked : null;
    if (newAgent?.hidden) throw new BadRequestException(`المكتب ${newAgent.name} مؤرشف. استعده أولاً`);
    const ledgerParty = newAgent
      ? await this.ledgerOf(newAgent)
      : await this.prisma.party.findUniqueOrThrow({ where: { id: tx.partyId! } });
    const agentId = newAgent?.id ?? currentAgentId;
    const date = dto.date ? new Date(dto.date) : undefined;
    const common: Prisma.TransactionUncheckedUpdateInput = {
      ...(date ? { date } : {}),
      ...(newAgent ? { partyId: ledgerParty.id, clearanceAgentId: newAgent.id } : {}),
    };

    const updates: { id: number; data: Prisma.TransactionUncheckedUpdateInput }[] = [];
    let manifest: Awaited<ReturnType<ClearanceRepository['findManifestByUid']>> = null;

    if (exp) {
      const data: Prisma.TransactionUncheckedUpdateInput = { ...common };
      if (dto.manifestId !== undefined) {
        manifest = await this.requireOurManifest(dto.manifestId);
        data.manifestId = manifest.id;
      }
      if (dto.categoryId !== undefined) data.categoryId = dto.categoryId ? (await this.resolveCategory(dto.categoryId)) ?? null : null;
      if (dto.amount !== undefined) data.credit = dto.amount;
      if (dto.note !== undefined) data.note = dto.note.trim() || exp.note;
      updates.push({ id: exp.id, data });
    }

    if (pay) {
      const data: Prisma.TransactionUncheckedUpdateInput = { ...common };
      const treasury = dto.treasuryId
        ? await this.requireTreasury(dto.treasuryId)
        : pay.treasuryId ? await this.prisma.treasuryAccount.findUniqueOrThrow({ where: { id: pay.treasuryId } }) : null;
      if (!treasury) throw new BadRequestException('اختر الخزنة');
      const rate = dto.rate ?? (pay.exchangeRate || undefined);
      if (exp) {
        // تخليص نقدي: المبلغ بعملة حساب المكتب، والخزنة بتنقص بعملتها.
        const ledger = dto.amount ?? exp.credit;
        const cashOut = this.fromLedger(ledger, ledgerParty.currency, treasury.currency, rate);
        Object.assign(data, { debit: ledger, cashOut, treasuryId: treasury.id, exchangeRate: cashOut !== ledger ? rate ?? 0 : 0 });
      } else {
        // دفعة: المبلغ بعملة الخزنة.
        const cash = dto.amount ?? pay.cashOut;
        const ledger = this.toLedger(cash, treasury.currency, ledgerParty.currency, rate);
        Object.assign(data, { debit: ledger, cashOut: cash, treasuryId: treasury.id, exchangeRate: ledger !== cash ? rate ?? 0 : 0 });
        if (dto.note !== undefined) data.note = dto.note.trim() || pay.note;
      }
      updates.push({ id: pay.id, data });
    }

    const [first] = await this.repo.updateMovements(updates);
    if (manifest) await this.pinAgentOnManifest(manifest, agentId);
    return first;
  }

  /** حذف حركة تخليص — بالكاسكيد بتاع الحركات (التخليص النقدي برجليه، وأثره على الخزنة). */
  async remove(uid: string) {
    const tx = await this.repo.findMovementByUid(uid);
    if (!tx) throw new NotFoundException('الحركة غير موجودة');
    this.assertClearanceType(tx.type);
    await deleteTransactionAndEffects(this.prisma, tx.id);
    return { ok: true };
  }

  // ───────────────────────────── مساعدات ─────────────────────────────

  private async expenseParts(dto: AddClearanceExpenseDto) {
    const manifest = await this.requireOurManifest(dto.manifestId);
    const agent = await this.requireAgent(dto.agentId);
    const ledger = await this.ledgerOf(agent);
    const categoryId = await this.resolveCategory(dto.categoryId);
    return { manifest, agent, ledger, categoryId };
  }

  private expenseRow(
    dto: AddClearanceExpenseDto,
    manifest: { id: number; no: string; vehicleNo: string | null; trailerNo: string | null },
    agent: { id: number; name: string },
    ledger: { id: number },
    categoryId?: number,
  ) {
    const vehicle = [manifest.vehicleNo, manifest.trailerNo].filter(Boolean).join(' / ');
    const note = dto.note?.trim() || `جمرك وتخليص كشف ${manifest.no}${vehicle ? ` — ${vehicle}` : ''}`;
    return {
      date: new Date(dto.date),
      type: CLEARANCE_EXPENSE_TYPE,
      partyId: ledger.id,
      clearanceAgentId: agent.id,
      credit: dto.amount, // المبلغ مستحق للمكتب (أو للمورد المربوط به) علينا
      manifestId: manifest.id,
      ...(categoryId ? { categoryId } : {}),
      note: `${note}${this.viaAgent(agent, ledger)}`,
    };
  }

  /** الحساب اللي بتترحّل عليه حركات المكتب: المورد المربوط به، وإلا المكتب نفسه. */
  private async ledgerOf<T extends { clearanceSupplierId: number | null }>(agent: T) {
    if (!agent.clearanceSupplierId) return agent;
    return this.prisma.party.findUniqueOrThrow({ where: { id: agent.clearanceSupplierId } });
  }

  /** اسم المكتب في بيان الحركة لما تترحّل على حساب المورد، عشان يظهر في كشفه. */
  private viaAgent(agent: { id: number; name: string }, ledger: { id: number }) {
    return ledger.id !== agent.id ? ` — مكتب ${agent.name}` : '';
  }

  /**
   * المورد المربوط بالمكتب. سلسلة فاضية = فك الربط. لازم يكون بنفس عملة المكتب، لأن
   * مبالغ التخليص بتتكتب بعملة المكتب وبتترحّل على المورد كما هي.
   */
  private async resolveSupplier(uid: string | undefined, officeCurrency: Currency) {
    if (!uid) return null;
    const supplier = await this.repo.findPartyByUid(uid);
    if (!supplier) throw new NotFoundException('المورد غير موجود');
    if (supplier.role !== 'SUPPLIER') throw new BadRequestException(`${supplier.name} غير مسجل كمورد`);
    if (supplier.currency !== officeCurrency) {
      throw new BadRequestException(`عملة حساب المورد  تختلف عن عملة المكتب. لا يمكن الربط`);
    }
    return supplier.id;
  }

  /** أول تخليص على الكشف بيثبّت المكتب عليه، عشان الكشف يعرف مكتبه. */
  private async pinAgentOnManifest(manifest: { id: number; clearingAgentId: number | null }, agentId: number) {
    if (!manifest.clearingAgentId) {
      await this.prisma.manifest.update({ where: { id: manifest.id }, data: { clearingAgentId: agentId } });
    }
  }

  /** عربية من عندنا (خروج من المخزن) — مكتب الشحن ليس له تخليص عندنا. */
  private async requireOurManifest(uid: string) {
    const manifest = await this.repo.findManifestByUid(uid);
    if (!manifest) throw new NotFoundException('الكشف غير موجود');
    if (manifest.vehicleSource !== 'OURS') {
      throw new BadRequestException(`كشف رقم ${manifest.no} خروجه من مكتب شحن، وليس له تخليص وجمارك عندنا`);
    }
    return manifest;
  }

  // مبلغ بعملة الخزنة → عملة حساب المكتب
  private toLedger(amount: number, treasuryCur: Currency, agentCur: Currency, rate?: number) {
    if (treasuryCur === agentCur) return amount;
    if (!rate) throw new BadRequestException('اكتب سعر صرف الدولار');
    return treasuryCur === 'USD' ? amount * rate : amount / rate;
  }

  // مبلغ بعملة حساب المكتب → عملة الخزنة
  private fromLedger(amount: number, agentCur: Currency, treasuryCur: Currency, rate?: number) {
    if (treasuryCur === agentCur) return amount;
    if (!rate) throw new BadRequestException('اكتب سعر صرف الدولار');
    return treasuryCur === 'USD' ? amount / rate : amount * rate;
  }

  private assertClearanceType(type: string) {
    if (type !== CLEARANCE_EXPENSE_TYPE && type !== CLEARANCE_PAY_TYPE) {
      throw new BadRequestException('هذه الحركة ليست من حركات التخليص');
    }
  }

  private async requireTreasury(uid: string) {
    const t = await this.repo.findTreasuryByUid(uid);
    if (!t) throw new NotFoundException('الخزنة غير موجودة');
    return t;
  }

  /** المكتب المؤرشف مايتسجّلش عليه حركات جديدة — إلا في شاشات الإدارة (allowArchived). */
  private async requireAgent(uid: string, allowArchived = false) {
    const agent = await this.repo.findPartyByUid(uid);
    if (!agent) throw new NotFoundException('مكتب التخليص غير موجود');
    if (agent.role !== 'CLEARANCE') throw new BadRequestException(`${agent.name} غير مسجل كمكتب تخليص`);
    if (agent.hidden && !allowArchived) throw new BadRequestException(`المكتب ${agent.name} مؤرشف. استعده أولاً`);
    return agent;
  }

  private async resolveCategory(uid?: string) {
    if (!uid) return undefined;
    const c = await this.repo.findCategoryByUid(uid);
    if (!c) throw new NotFoundException('بند المصروف غير موجود');
    return c.id;
  }
}
