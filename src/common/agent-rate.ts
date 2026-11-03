import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AgentRate, rateAtDate } from './usd-fifo';

// العملة تتغيّر من عند الوكيل: لا يُكتب سعر على أي حركة أخرى. الحركة بعملتين تأخذ سعر
// الوكيل في تاريخها، وتُحسب من جديد لو تعدّل سعر عند الوكيل.
type Db = Prisma.TransactionClient;

export async function agentRates(db: Db): Promise<AgentRate[]> {
  const rows = await db.dollarAgentTx.findMany({
    where: { type: 'USD_OUT', exchangeRate: { gt: 0 } },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    select: { date: true, exchangeRate: true },
  });
  return rows.map((r) => ({ date: r.date, rate: r.exchangeRate }));
}

export async function requireAgentRate(db: Db, date: Date): Promise<number> {
  const rate = rateAtDate(await agentRates(db), date);
  if (!rate) throw new BadRequestException('لا يوجد سعر صرف من الوكيل حتى الآن. سجّل توريد دولار من الوكيل أولاً');
  return rate;
}

// إعادة حساب الحركات المسعّرة من الوكيل بعد إضافة سعر أو تعديله أو حذفه.
export async function repriceAgentRows(db: Db) {
  const rates = await agentRates(db);
  if (!rates.length) return;
  const rows = await db.transaction.findMany({
    where: { agentPriced: true },
    select: {
      id: true, type: true, date: true, groupId: true, clearanceAgentId: true,
      debit: true, credit: true, cashOut: true,
      treasury: { select: { currency: true } },
    },
  });
  for (const t of rows) {
    const rate = rateAtDate(rates, t.date);
    if (!rate) continue;
    const toUsd = t.treasury?.currency === 'USD';
    const data: Prisma.TransactionUncheckedUpdateInput = { exchangeRate: rate };
    if (t.type === 'تحويل عملة') {
      data.cashIn2 = toUsd ? t.cashOut * rate : t.cashOut / rate;
    } else if (t.clearanceAgentId != null) {
      // التخليص النقدي (groupId) مبلغه بعملة الحساب، والدفعة مبلغها بعملة الخزنة.
      if (t.groupId) data.cashOut = toUsd ? t.debit / rate : t.debit * rate;
      else data.debit = toUsd ? t.cashOut * rate : t.cashOut / rate;
    } else if (t.credit > 0) {
      data.cashIn = t.credit / rate;
    } else {
      data.cashOut = t.debit / rate;
    }
    await db.transaction.update({ where: { id: t.id }, data });
  }
}
