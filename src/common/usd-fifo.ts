// دورة الدولار: جنيه ← وكيل ← دولار للمورد بسعر صرف ← فاتورة دولار ← جنيه.
//
// حساب الطرف الدولاري مسجّل بالدولار. القيمة بالجنيه مشتقة هنا بطريقة FIFO:
//  • كل حركة مدينة على الطرف (دفع دولار لمورد من الوكيل، …) شريحة دولار بسعر صرفها.
//  • كل حركة دائنة (فاتورة شراء، بنود شحن، شراء خارجي، …) تستهلك الشرائح بالترتيب:
//    أقدم شريحة أولاً، وبعد ما تخلص تدخل على اللي بعدها — بغض النظر عن ترتيب التاريخ
//    بين الدفعة والفاتورة.
//  • الجزء من الفاتورة اللي لم تقابله شريحة بعد = «غير مسعّر»: لا يدخل تكلفة البضاعة،
//    ويتسعّر تلقائياً بالسعر الحقيقي أول ما الوكيل يورّد. الميزان وحده يقرّبه بآخر سعر.
//  • شريحة دولار بدون سعر خاص بها تُقيَّم بسعر الوكيل في تاريخها، لا بآخر سعر. فسعر
//    جديد من الوكيل لا يغيّر قيمة الحركات السابقة. الرصيد الافتتاحي بأقدم سعر معروف.
//
// لا شيء من هذا مخزّن — يُعاد حسابه من حركات Transaction في كل قراءة، فتعديل أو حذف
// دفعة أو فاتورة ينعكس على الفور على كل الفواتير اللاحقة.

export type FifoTx = {
  id: number;
  partyId: number;
  date: Date;
  createdAt: Date;
  debit: number;
  credit: number;
  cashIn: number;
  cashOut: number;
  exchangeRate: number;
  invoiceId: number | null;
  /** سعر حركة الوكيل (USD_OUT) المرتبطة بهذا السطر — المصدر الأصلي للسعر */
  agentRate?: number;
};

export type AgentRate = { date: Date; rate: number };

// سعر الوكيل في تاريخ معيّن: آخر سعر حتى التاريخ، وقبل أول سعر يؤخذ أول سعر.
// الأسعار مرتبة بالتاريخ من الأقدم.
export function rateAtDate(rates: AgentRate[], date: Date): number | null {
  if (!rates.length) return null;
  let found = rates[0].rate;
  for (const r of rates) {
    if (r.date.getTime() > date.getTime()) break;
    found = r.rate;
  }
  return found;
}

export type FifoTxResult = {
  usd: number;
  egp: number;           // القيمة بالجنيه للجزء المسعّر (الحقيقي)
  pricedUsd: number;
  unpricedUsd: number;   // دائن فقط: دولار لم تقابله دفعة بعد
  rate: number;          // سعر الصرف الفعلي للجزء المسعّر (0 = غير مسعّر بالكامل)
  side: 'debit' | 'credit';
};

export type FifoInvoiceResult = { usd: number; egp: number; pricedUsd: number; unpricedUsd: number; rate: number };

export type FifoPartyResult = {
  usdBalance: number;    // نفس رصيد الطرف بالدولار (مدين موجب)
  egpBalance: number;    // الشرائح المتبقية بسعرها − غير المسعّر × آخر سعر (تقريبي)
  unpricedUsd: number;
  lastRate: number;
  openingRate: number;   // سعر الرصيد الافتتاحي: أقدم سعر معروف
};

export type FifoResult = {
  byTx: Map<number, FifoTxResult>;
  byInvoice: Map<number, FifoInvoiceResult>;
  byParty: Map<number, FifoPartyResult>;
};

const EPS = 1e-9;

// سعر شريحة مدينة: سعر حركة الوكيل، ثم السعر المختوم عليها، ثم نسبة الجنيه الخارج من
// الخزنة للدولار. نسبة 1 معناها إن المبلغ الخارج مسجّل بالدولار نفسه (مدفوع مع فاتورة
// دولار)، فلا تحمل سعراً.
function debitRate(t: FifoTx): number | null {
  if (t.agentRate && t.agentRate > 0) return t.agentRate;
  if (t.exchangeRate > 0) return t.exchangeRate;
  if (t.cashOut > 0 && t.debit > 0 && Math.abs(t.cashOut / t.debit - 1) > EPS) return t.cashOut / t.debit;
  return null;
}

export function computeUsdFifo(
  parties: { id: number; opening: number }[],
  txs: FifoTx[],
  agentRates: AgentRate[] = [],
): FifoResult {
  const rates = agentRates
    .filter((r) => r.rate > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const globalLastRate = rates.length ? rates[rates.length - 1].rate : 0;
  const rateAt = (date: Date) => rateAtDate(rates, date);
  const earliestRate = rates.length ? rates[0].rate : null;

  const byTx = new Map<number, FifoTxResult>();
  const byInvoice = new Map<number, FifoInvoiceResult>();
  const byParty = new Map<number, FifoPartyResult>();

  const txsByParty = new Map<number, FifoTx[]>();
  for (const t of txs) {
    if (!txsByParty.has(t.partyId)) txsByParty.set(t.partyId, []);
    txsByParty.get(t.partyId)!.push(t);
  }

  for (const p of parties) {
    const list = (txsByParty.get(p.id) ?? []).slice().sort(
      (a, b) => a.date.getTime() - b.date.getTime() || a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id,
    );

    // آخر سعر معروف لهذا المورد (بالتاريخ)، وإلا آخر سعر وكيل عموماً.
    let lastRate = 0;
    for (const t of list) {
      if (t.debit > 0) {
        const r = debitRate(t);
        if (r) lastRate = r;
      }
    }
    if (!lastRate) lastRate = globalLastRate;

    type Layer = { txId: number | null; left: number; rate: number | null };
    const supply: Layer[] = [];
    const demand: { txId: number | null; usd: number }[] = [];
    const opening = Number(p.opening) || 0;
    if (opening > 0) supply.push({ txId: null, left: opening, rate: earliestRate });
    if (opening < 0) demand.push({ txId: null, usd: -opening });

    let usdBalance = opening;
    for (const t of list) {
      const d = Number(t.debit) || 0;
      const c = Number(t.credit) || 0;
      usdBalance += d - c;
      if (d > 0) {
        // شريحة بدون سعر خاص (مرتجع، مدفوع مع فاتورة) تُقيَّم بسعر الوكيل في تاريخها.
        const rate = debitRate(t) ?? rateAt(t.date);
        supply.push({ txId: t.id, left: d, rate });
        const r = rate ?? lastRate;
        byTx.set(t.id, { usd: d, egp: d * r, pricedUsd: rate ? d : 0, unpricedUsd: 0, rate: rate ?? 0, side: 'debit' });
      }
      if (c > 0) demand.push({ txId: t.id, usd: c });
    }

    let si = 0;
    let unpricedTotal = 0;
    for (const dm of demand) {
      let remaining = dm.usd;
      let egp = 0;
      let priced = 0;
      while (remaining > EPS && si < supply.length) {
        const s = supply[si];
        const take = Math.min(remaining, s.left);
        egp += take * (s.rate ?? lastRate);
        priced += take;
        s.left -= take;
        remaining -= take;
        if (s.left <= EPS) si++;
      }
      const unpriced = remaining > EPS ? remaining : 0;
      unpricedTotal += unpriced;
      if (dm.txId != null) {
        byTx.set(dm.txId, {
          usd: dm.usd, egp, pricedUsd: priced, unpricedUsd: unpriced,
          rate: priced > EPS ? egp / priced : 0, side: 'credit',
        });
      }
    }

    let leftoverEgp = 0;
    for (let i = si; i < supply.length; i++) leftoverEgp += supply[i].left * (supply[i].rate ?? lastRate);

    byParty.set(p.id, {
      usdBalance,
      egpBalance: leftoverEgp - unpricedTotal * lastRate,
      unpricedUsd: unpricedTotal,
      lastRate,
      openingRate: earliestRate ?? lastRate,
    });

    // تجميع أرجل كل فاتورة (الأصناف + بنود الشحن) على نفس جانبها.
    for (const t of list) {
      if (t.invoiceId == null) continue;
      const r = byTx.get(t.id);
      if (!r) continue;
      // أرجل الفاتورة لا تلمس الخزنة. المدفوع/المحصّل مع الفاتورة رجل خزنة منفصلة لا تُجمع.
      if (t.cashIn > 0 || t.cashOut > 0) continue;
      const acc = byInvoice.get(t.invoiceId) ?? { usd: 0, egp: 0, pricedUsd: 0, unpricedUsd: 0, rate: 0 };
      acc.usd += r.usd;
      acc.egp += r.egp;
      acc.pricedUsd += r.pricedUsd;
      acc.unpricedUsd += r.unpricedUsd;
      acc.rate = acc.pricedUsd > EPS ? acc.egp / acc.pricedUsd : 0;
      byInvoice.set(t.invoiceId, acc);
    }
  }

  return { byTx, byInvoice, byParty };
}
