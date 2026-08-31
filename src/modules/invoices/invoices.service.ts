import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceKind } from '@prisma/client'; // used by create()
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateInvoiceDto, UpdateInvoiceDto, CommissionDto } from './dto/invoices.dto';
import { InvoicesRepository } from './invoices.repository';

@Injectable()
export class InvoicesService {
  constructor(private repo: InvoicesRepository) {}

  findAll(q: PaginationQueryDto, kind?: InvoiceKind, partyId?: string) { return this.repo.findAll(q, kind, partyId); }

  async findOne(id: string) {
    const inv = await this.repo.findOne(id);
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  // الأرقام اللي بتكمّل شكل الشيت: حساب قديم + سدادات + الباقي عليه
  async sheet(id: string) {
    const data = await this.repo.sheet(id);
    if (!data) throw new NotFoundException('Invoice not found');
    return data;
  }

  /**
   * تابات العربيات جوّه الفاتورة — تاب لكل عربية، فيه أصنافها ومصاريفها.
   *
   * توزيع المصاريف على التابات (القاعدة اللي اتفقنا عليها): كل عربية بتاخد المصاريف
   * اللي اتضافت **من تاريخ العربية اللي قبلها** لحد تاريخها هي؛ وأول عربية بتاخد من
   * تاريخ الفاتورة. آخر عربية تابها مفتوح — بياخد أي مصروف بعد كده **لحد ما يتقفل**،
   * وبعد القفل المصاريف الجديدة بتستنى العربية اللي بعدها.
   *
   * المصروف اللي اتضاف من جوّه التاب بيتثبّت عليه (manifestId) فبيفضل فيه مهما اتغيّر
   * تاريخه — التثبيت بيغلب النافذة الزمنية.
   */
  async manifestTabs(id: string) {
    const inv = await this.repo.invoiceWithManifests(id);
    if (!inv) throw new NotFoundException('Invoice not found');

    const manifests = inv.manifests;
    const expenses = manifests.length || inv.partyId
      ? await this.repo.manifestExpenseCandidates(inv.id, inv.partyId, manifests.map((m) => m.id))
      : [];

    // سعر الصنف من بند الفاتورة اللي بنفس الاسم — كشف العربية بيسجّل اسم وعدد بس.
    const priceByName = new Map<string, number>();
    for (const it of inv.items) {
      const name = it.product?.name?.trim();
      if (name && !priceByName.has(name)) priceByName.set(name, it.price);
    }

    const amountOf = (e: { debit: number; cashOut: number; expAmt: number }) =>
      e.cashOut || e.debit || e.expAmt || 0;

    const tabs = manifests.map((m, i) => {
      // النافذة: من تاريخ العربية اللي قبلها (أو تاريخ الفاتورة لأول واحدة) لحد
      // تاريخ العربية دي — إلا آخر عربية، تابها مفتوح لحد ما يتقفل.
      const from = i === 0 ? inv.date : manifests[i - 1].date;
      const isLast = i === manifests.length - 1;
      const to = m.closedAt ?? (isLast ? null : m.date);

      const rows = expenses.filter((e) => {
        if (e.manifestId != null) return e.manifestId === m.id; // متثبّت: بيغلب النافذة
        if (e.date < from) return false;
        return to === null || e.date <= to;
      });

      const items = m.items.map((it) => {
        const price = priceByName.get(it.name.trim()) ?? null;
        return { id: it.uid, name: it.name, qty: it.qty, price, total: price === null ? null : it.qty * price };
      });

      // نفس قاعدة قايمة الكشوفات: مفيش رحلات = مش متحدّد؛ فيه رحلة وصلت = وصلت؛
      // غير كده لسه في الطريق.
      const status: 'arrived' | 'pending' | 'none' = m.driverTrips.length === 0
        ? 'none'
        : m.driverTrips.some((t) => t.arrivalDate != null) ? 'arrived' : 'pending';

      return {
        id: m.uid,
        no: m.no,
        date: m.date,
        clientName: m.clientName,
        vehicleNo: m.vehicleNo,
        vehicleLabel: m.vehicleLabel,
        trailerNo: m.trailerNo,
        driverName: m.driverName,
        driverNID: m.driverNID,
        driverPhone: m.driverPhone,
        status,
        note: m.note,
        closedAt: m.closedAt,
        closedBy: m.closedBy,
        from,
        to,
        items,
        itemsTotal: items.reduce((s, it) => s + (it.total ?? 0), 0),
        expenses: rows.map((e) => ({
          id: e.uid,
          date: e.date,
          type: e.type,
          note: e.note,
          category: e.category?.name ?? null,
          treasury: e.treasury?.name ?? null,
          amount: amountOf(e),
          pinned: e.manifestId != null,
        })),
        expensesTotal: rows.reduce((s, e) => s + amountOf(e), 0),
      };
    });

    return { currency: inv.currency, invoiceNo: inv.no, tabs };
  }

  /** قفل/فتح تاب العربية — بعد القفل ما بياخدش مصاريف جديدة بالتاريخ. */
  async setManifestTabClosed(uid: string, closed: boolean, userName?: string) {
    const m = await this.repo.manifestForTab(uid);
    if (!m) throw new NotFoundException('Manifest not found');
    if (!m.invoiceId) throw new BadRequestException('العربية دي مش مربوطة بفاتورة');
    if (closed && m.closedAt) throw new ConflictException('التاب مقفول بالفعل');
    if (!closed && !m.closedAt) throw new ConflictException('التاب مفتوح أصلاً');
    return this.repo.setManifestClosed(m.id, closed ? new Date() : null, closed ? (userName ?? null) : null);
  }

  // بوابة العميل: قايمة فواتيره عشان تابات «فاتورة N / استلامات N»
  async myInvoices(partyUid: string | undefined) {
    if (!partyUid) throw new ForbiddenException('No party linked to this account');
    return this.repo.clientInvoiceList(partyUid);
  }

  /**
   * بوابة العميل: تابات عربيات فاتورته. نفس حسبة الكشف الداخلي بالظبط، بس مقصورة على
   * فواتيره هو، ومن غير سباكة داخلية — اسم الخزنة اللي اتدفع منها المصروف ما بيخرجش،
   * ولا حالة قفل التاب (دي إدارية) ولا بيانات السائق.
   */
  async myManifestTabs(partyUid: string | undefined, invoiceUid: string) {
    if (!partyUid) throw new ForbiddenException('No party linked to this account');
    if (!(await this.repo.invoiceBelongsToClient(partyUid, invoiceUid))) {
      throw new NotFoundException('Invoice not found');
    }
    const { currency, tabs } = await this.manifestTabs(invoiceUid);
    return {
      currency,
      tabs: tabs.map((t) => ({
        id: t.id,
        no: t.no,
        date: t.date,
        clientName: t.clientName,
        vehicleLabel: t.vehicleLabel,
        vehicleNo: t.vehicleNo,
        trailerNo: t.trailerNo,
        driverName: t.driverName,
        // الرقم القومي وتليفون السائق بيانات شخصية — مابتخرجش للعميل.
        status: t.status,
        note: t.note,
        items: t.items,
        itemsTotal: t.itemsTotal,
        expenses: t.expenses.map((e) => ({
          id: e.id, date: e.date, note: e.note, category: e.category, amount: e.amount,
        })),
        expensesTotal: t.expensesTotal,
      })),
    };
  }

  // بوابة العميل: نفس الفاتورة بشكل الشيت، مقصورة على طرف الحساب الداخل
  async myInvoice(partyUid: string | undefined, invoiceUid: string) {
    if (!partyUid) throw new ForbiddenException('No party linked to this account');
    const data = await this.repo.clientInvoice(partyUid, invoiceUid);
    if (!data) throw new NotFoundException('Invoice not found');
    return data;
  }

  // ناولون/شاي بيتخصموا نقدًا — كل واحد لازمه خزينة (خاصة بيه أو خزينة الفاتورة).
  private assertTreasuryForExtras(dto: CreateInvoiceDto | UpdateInvoiceDto) {
    if (dto.fake) return;
    const missingFreight = dto.items.some((it) => (it.freight ?? 0) > 0 && !it.freightTreasuryId && !dto.treasuryId);
    const missingTea = dto.items.some((it) => (it.tea ?? 0) > 0 && !it.teaTreasuryId && !dto.treasuryId);
    if (missingFreight || missingTea) {
      throw new BadRequestException('اختر الخزنة اللي هيتخصم منها الناولون / الشاي');
    }
  }

  create(dto: CreateInvoiceDto, createdById?: number) {
    this.assertTreasuryForExtras(dto);
    const total = dto.items.reduce((s, it) => s + it.qty * it.price, 0);
    const paid = dto.paid || 0;
    const discount = dto.discount && dto.discount > 0 ? Math.min(dto.discount, total) : 0;
    const isSale = dto.kind === InvoiceKind.SALE;
    return this.repo.create(dto, { total, paid, discount, isSale, createdById });
  }

  update(id: string, dto: UpdateInvoiceDto, createdById?: number) {
    this.assertTreasuryForExtras(dto);
    const total = dto.items.reduce((s, it) => s + it.qty * it.price, 0);
    const paid = dto.paid ?? 0;
    const discount = dto.discount && dto.discount > 0 ? Math.min(dto.discount, total) : 0;
    return this.repo.update(id, dto, { total, paid, discount, createdById });
  }

  updateCommission(uid: string, dto: CommissionDto) { return this.repo.updateCommission(uid, dto); }

  async remove(id: string, cascade: boolean) {
    const inv = await this.repo.findByUid(id);
    if (!inv) throw new NotFoundException('Invoice not found');
    if (!cascade) {
      const related = await this.repo.countRelatedTransactions(inv.id);
      if (related > 0) {
        throw new ConflictException(`يوجد ${related} حركة مالية مرتبطة بهذه الفاتورة — أكّد حذفها معها لحذف الفاتورة`);
      }
    }
    return this.repo.remove(id);
  }

  peekNextNo(partyUid: string) { return this.repo.peekNextNo(partyUid); }
}
