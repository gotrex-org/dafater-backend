import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ربح العربية — قسم «تكاليف الشحن» في كشف العربية، وتقرير ربح كل عربية.
 *
 *   ربح العربية = بنود الشحن على العملاء − (الإيجار + الجمرك والتخليص + التحميل + الشفتنة)
 *
 *  - بنود الشحن: سطور InvoiceCharge المربوطة بالعربية صراحةً، + البنود غير المربوطة على
 *    فاتورة العربية لو الفاتورة عليها عربية واحدة بس (الحالة الغالبة). لو الفاتورة عليها
 *    أكتر من عربية، البنود غير المربوطة بترجع في `unassignedCharges` لحد ما تتربط.
 *  - الإيجار: `agreedFreight` لرحلات كشف السائقين على العربية.
 *  - الجمرك والتخليص: حركات «جمارك» على العربية (مترحّلة على حساب مكتب التخليص).
 *  - التحميل والشفتنة: مصروفات مربوطة بالعربية على بند `vehicleLink`. أي مصروف تاني
 *    مربوط بالعربية بيرجع في `otherExpenses` للعرض بس، ومش داخل في الربح.
 */
export async function computeVehicleProfits(prisma: PrismaService, where: Prisma.ManifestWhereInput) {
  const manifests = await prisma.manifest.findMany({
    where,
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    select: {
      id: true, uid: true, no: true, date: true, clientName: true,
      vehicleNo: true, trailerNo: true, vehicleLabel: true, driverName: true, vehicleSource: true,
      invoice: {
        select: {
          id: true, uid: true, no: true, kind: true, currency: true,
          _count: { select: { manifests: true } },
          charges: {
            where: { manifestId: null },
            select: { uid: true, qty: true, price: true, note: true, chargeType: { select: { name: true } } },
          },
        },
      },
      charges: {
        select: {
          uid: true, qty: true, price: true, note: true,
          chargeType: { select: { name: true } },
          invoice: { select: { uid: true, no: true, kind: true } },
        },
      },
      driverTrips: { select: { uid: true, driverName: true, agreedFreight: true, departureDate: true, arrivalDate: true } },
      transactions: {
        select: {
          uid: true, date: true, type: true, note: true,
          debit: true, credit: true, cashIn: true, cashOut: true, expAmt: true,
          category: { select: { name: true, vehicleLink: true } },
          party: { select: { uid: true, name: true } },
          treasury: { select: { name: true } },
        },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      },
    },
  });

  return manifests.map((m) => {
    type Line = { id: string; name: string; qty: number; price: number; total: number; note: string | null; invoiceNo: string | null };
    const revenue: Line[] = [];
    // بند على فاتورة شراء = تكلفة مش إيراد — بيتخصم من الإيراد.
    const sign = (kind?: string) => (kind === 'PURCHASE' ? -1 : 1);
    for (const c of m.charges) {
      revenue.push({
        id: c.uid, name: c.chargeType.name, qty: c.qty, price: c.price,
        total: sign(c.invoice?.kind) * c.qty * c.price, note: c.note, invoiceNo: c.invoice?.no ?? null,
      });
    }
    const soleVehicle = !!m.invoice && m.invoice._count.manifests === 1;
    const unassigned: Line[] = [];
    for (const c of m.invoice?.charges ?? []) {
      const line = {
        id: c.uid, name: c.chargeType.name, qty: c.qty, price: c.price,
        total: sign(m.invoice?.kind) * c.qty * c.price, note: c.note, invoiceNo: m.invoice?.no ?? null,
      };
      (soleVehicle ? revenue : unassigned).push(line);
    }

    const rentLines = m.driverTrips.map((t) => ({
      id: t.uid, driverName: t.driverName, amount: t.agreedFreight || 0,
      departureDate: t.departureDate, arrivalDate: t.arrivalDate,
    }));

    const customsLines = m.transactions
      .filter((t) => t.type === 'جمارك')
      .map((t) => ({ id: t.uid, date: t.date, amount: t.credit || 0, office: t.party, note: t.note }));

    const amountOf = (t: { cashOut: number; cashIn: number; debit: number; expAmt: number }) =>
      (t.cashOut || 0) - (t.cashIn || 0) || t.expAmt || t.debit || 0;
    const expenseRows = m.transactions.filter((t) => t.type.startsWith('مصروف') && t.type !== 'مصروف على عميل');
    const toLine = (t: (typeof expenseRows)[number]) => ({
      id: t.uid, date: t.date, category: t.category?.name ?? null, amount: amountOf(t),
      note: t.note, treasury: t.treasury?.name ?? null,
    });
    const vehicleExpenses = expenseRows.filter((t) => t.category?.vehicleLink).map(toLine);
    const otherExpenses = expenseRows.filter((t) => !t.category?.vehicleLink).map(toLine);

    const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
    // التحميل والشفتنة وأي بند مربوط بعربية — مجمّعين بالاسم.
    const byCategory = new Map<string, number>();
    for (const e of vehicleExpenses) {
      const k = e.category ?? 'أخرى';
      byCategory.set(k, (byCategory.get(k) ?? 0) + e.amount);
    }

    const revenueTotal = revenue.reduce((s, l) => s + l.total, 0);
    const rent = sum(rentLines);
    const customs = sum(customsLines);
    const vehicleCosts = sum(vehicleExpenses);
    const costs = rent + customs + vehicleCosts;

    return {
      id: m.uid,
      no: m.no,
      date: m.date,
      clientName: m.clientName,
      vehicleNo: m.vehicleNo,
      trailerNo: m.trailerNo,
      vehicleLabel: m.vehicleLabel,
      driverName: m.driverName,
      vehicleSource: m.vehicleSource,
      invoice: m.invoice ? { id: m.invoice.uid, no: m.invoice.no, kind: m.invoice.kind, currency: m.invoice.currency } : null,
      revenue,
      revenueTotal,
      unassignedCharges: unassigned,
      rent: { total: rent, lines: rentLines },
      customs: { total: customs, lines: customsLines },
      vehicleExpenses: {
        total: vehicleCosts,
        lines: vehicleExpenses,
        byCategory: [...byCategory.entries()].map(([name, total]) => ({ name, total })),
      },
      otherExpenses: { total: sum(otherExpenses), lines: otherExpenses },
      costs,
      profit: revenueTotal - costs,
    };
  });
}
