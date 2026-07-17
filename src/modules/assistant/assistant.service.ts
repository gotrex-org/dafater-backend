import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { ChatDto } from './dto/assistant.dto';

// وصف مختصر لأقسام البرنامج — عشان المساعد يقدر يقترح تحسينات على الويبسايت نفسه.
const APP_OVERVIEW = `
برنامج "دفاتر" لمحاسبة تجارة الجملة (أبو شامة). الأقسام:
- لوحة التحكم، الإدخال اليومي (صرف وتوريد نقدية: عميل/مورد/مخزن/بضاعة/عهدة/تسوية حساب/تسوية نقدية)،
- الفواتير (بيع/شراء + ناولون/شاي/عمولة على الأصناف + البيع الخارجي + المرتجعات + الخصومات + فواتير وهمية)،
- كشوفات العربيات، كشف السائقين، الطلبيات، كشف الحساب (عملاء/موردين/عمولة/عهدة + ميزان الحسابات)،
- المخازن، الخزنة، الإعدادات، سجل النشاط، تقرير اليوم (وجواه التقارير + التذكيرات).
`;

@Injectable()
export class AssistantService {
  constructor(private prisma: PrismaService, private reports: ReportsService) {}

  isConfigured() {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  // لقطة مختصرة لأرقام الشهر الحالي — بتتحط في سياق المحادثة عشان المساعد يحلّل عليها.
  private async buildSnapshot() {
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const [summary, pl, expenses, topClients, topSuppliers, topProducts, custody] = await Promise.all([
      this.reports.summary(from),
      this.reports.profitLoss(from),
      this.reports.expensesByCategory(from),
      this.reports.topParties('SALE' as any, from, undefined, 5),
      this.reports.topParties('PURCHASE' as any, from, undefined, 5),
      this.reports.topProducts(from, undefined, 5),
      this.reports.custodyBalances(),
    ]);

    // إجمالي المستحق لك (عليهم) والمستحق عليك (لهم) من أرصدة الأطراف.
    const parties = await this.prisma.party.findMany({ select: { id: true, opening: true } });
    const agg = await this.prisma.transaction.groupBy({ by: ['partyId'], _sum: { debit: true, credit: true }, where: { partyId: { not: null } } });
    const byId = new Map(agg.map((a) => [a.partyId, (a._sum.debit || 0) - (a._sum.credit || 0)]));
    let receivable = 0, payable = 0;
    for (const p of parties) {
      const bal = (p.opening || 0) + (byId.get(p.id) || 0);
      if (bal > 0) receivable += bal; else payable += -bal;
    }

    return {
      الفترة: `من ${from} لحد النهارده`,
      المبيعات_والمشتريات: summary,
      ربح_وخسارة: pl,
      المصاريف_بالبنود: expenses,
      اكتر_عملاء: topClients,
      اكتر_موردين: topSuppliers,
      اكتر_اصناف: topProducts,
      العهد_المفتوحة: custody,
      اجمالي_مستحق_لك_عليهم: Math.round(receivable),
      اجمالي_مستحق_عليك_لهم: Math.round(payable),
    };
  }

  async chat(dto: ChatDto): Promise<{ reply: string }> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { reply: 'الشات لسه مش مفعّل — محتاج تحط مفتاح Anthropic API في إعدادات السيرفر (المتغيّر ANTHROPIC_API_KEY) وبعدها يشتغل على طول.' };
    }
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
    const snapshot = await this.buildSnapshot().catch(() => null);

    const system = [
      'إنت مساعد ذكي لصاحب محل جملة اسمه "أبو شامة" وبيستخدم برنامج محاسبة اسمه "دفاتر".',
      'مهمتك: تساعده يفكّر في شغله، تحلّل أرقامه، تجاوب أسئلته بالعامية المصرية باختصار ووضوح، وتقترح تحسينات لما يطلب.',
      'اتكلم بالمصري، وبأرقام محددة من البيانات اللي قدامك، وماتخترعش أرقام مش موجودة.',
      'لو سألك عن تحسينات ممكنة في البرنامج نفسه، استعن بوصف الأقسام ده واقترح أفكار عملية:',
      APP_OVERVIEW,
      snapshot ? `أرقام شغله للشهر الحالي (JSON):\n${JSON.stringify(snapshot)}` : 'مافيش بيانات متاحة دلوقتي.',
    ].join('\n\n');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system,
        messages: dto.messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { reply: `حصل خطأ من خدمة الذكاء الاصطناعي (${res.status}). لو المشكلة في اسم الموديل غيّر المتغيّر ANTHROPIC_MODEL. التفاصيل: ${txt.slice(0, 300)}` };
    }
    const data: any = await res.json();
    const reply = (data?.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n').trim();
    return { reply: reply || 'مافيش رد.' };
  }
}
