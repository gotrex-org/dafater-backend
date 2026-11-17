import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceKind } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateProductDto, MergeProductsDto, UpdateProductDto } from './dto/products.dto';
import { ProductsRepository } from './products.repository';
import { BalancesService } from '../balances/balances.service';
import { deleteConflict, type DeleteMode } from '../../common/delete-mode';
import { rateAtDate } from '../../common/usd-fifo';

@Injectable()
export class ProductsService {
  constructor(private repo: ProductsRepository, private balances: BalancesService) {}

  catalog() { return this.repo.catalog(); }
  findAll(q: PaginationQueryDto) { return this.repo.findAll(q); }
  findOne(id: string) { return this.repo.findOne(id); }
  lastPrices(kind: InvoiceKind) { return this.repo.lastPrices(kind); }

  /**
   * الموجود فعليًا من الصنف دلوقتي في كل المخازن مع بعض. مش (المشترى − المُباع):
   * ده بيحسب كمان المرتجعات وتسويات المخزن والبضاعة المعارة اللي لسه بره.
   */
  async stock(uid: string) {
    const product = await this.repo.findByUid(uid);
    if (!product) throw new NotFoundException('Product not found');
    return { onHand: await this.balances.stockOf(product.id) };
  }

  /**
   * كارت الصنف: كل حركة بسعرها بالمصري ورصيد الصنف بعدها (كل المخازن).
   *  - فاتورة شراء بالدولار: بسعر دفعات الوكيل اللي قابلتها، والجزء اللي لسه ما اتسعّرش «غير مسعّر».
   *  - أي حركة تانية بالدولار (بيع، مرتجع): بسعر الوكيل في تاريخها.
   *  - الرصيد: نفس حساب رصيد المخزن (الفواتير الحقيقية والمرتجعات والتسويات والإعارة)، ونفس
   *    اليوم الوارد قبل المنصرف. البيع الخارجي والفاتورة الوهمية مابيحرّكوش الرصيد.
   */
  async movements(uid: string) {
    const result = await this.repo.movements(uid);
    if (!result || Array.isArray(result)) return [];
    const { items, dealItems, returnItems, adjustments, loans, rates } = result;
    const needsFifo = items.some((it: any) => it.invoice.currency === 'USD' && it.invoice.kind === 'PURCHASE')
      || dealItems.some((it: any) => it.deal.supplier?.currency === 'USD');
    const fifo = needsFifo ? await this.balances.usdFifo() : null;
    const atRate = (amount: number, currency: string | null | undefined, date: Date) => {
      if (currency !== 'USD') return amount;
      const r = rateAtDate(rates, date);
      return r ? amount * r : null;
    };

    type Row = {
      id: string; date: Date; kind: string; party: string | null; warehouse: string | null; no: string;
      qty: number; price: number | null; currency: string; priceEgp: number | null;
      /** حركة الرصيد (+ داخل / − خارج)، وصفر للي مابيحرّكش المخزن */
      delta: number; balance: number | null; fake?: boolean;
    };
    const rows: Row[] = [];
    for (const it of items as any[]) {
      const inv = it.invoice;
      const isBuy = inv.kind === 'PURCHASE';
      let priceEgp: number | null = it.price;
      if (inv.currency === 'USD') {
        if (isBuy) {
          const f = fifo?.byInvoice.get(inv.id);
          priceEgp = f && f.pricedUsd > 0 && f.rate > 0 ? it.price * f.rate : null;
        } else priceEgp = atRate(it.price, 'USD', inv.date);
      }
      rows.push({
        id: it.uid, date: inv.date, kind: inv.kind, party: inv.party?.name ?? null, warehouse: inv.warehouse?.name ?? null,
        no: inv.no, qty: it.qty, price: it.price, currency: inv.currency, priceEgp,
        delta: inv.fake ? 0 : isBuy ? it.qty : -it.qty, balance: null, fake: !!inv.fake,
      });
    }
    for (const it of dealItems as any[]) {
      const d = it.deal;
      let buyEgp: number | null = it.buyPrice ?? null;
      if (buyEgp != null && d.supplier?.currency === 'USD') {
        const legs = d.transactions.map((t: { id: number }) => fifo?.byTx.get(t.id));
        const priced = legs.reduce((s: number, l: any) => s + (l?.pricedUsd ?? 0), 0);
        const unpriced = legs.some((l: any) => (l?.unpricedUsd ?? 0) > 1e-9);
        buyEgp = !unpriced && priced > 0 ? buyEgp * (legs.reduce((s: number, l: any) => s + (l?.egp ?? 0), 0) / priced) : null;
      }
      rows.push(
        { id: `${it.uid}-b`, date: d.date, kind: 'PURCHASE', party: d.supplier?.name ?? null, warehouse: 'بيع خارجي', no: d.no, qty: it.qty, price: it.buyPrice ?? null, currency: d.supplier?.currency ?? 'EGP', priceEgp: buyEgp, delta: 0, balance: null },
        { id: `${it.uid}-s`, date: d.date, kind: 'SALE', party: d.client?.name ?? null, warehouse: 'بيع خارجي', no: d.no, qty: it.qty, price: it.price, currency: d.client?.currency ?? 'EGP', priceEgp: atRate(it.price, d.client?.currency, d.date), delta: 0, balance: null },
      );
    }
    for (const it of returnItems as any[]) {
      const r = it.return;
      const cur = r.party?.currency ?? 'EGP';
      rows.push({
        id: it.uid, date: r.date, kind: r.kind === 'SALE' ? 'SALE_RETURN' : 'PURCHASE_RETURN',
        party: r.party?.name ?? null, warehouse: r.warehouse?.name ?? null, no: r.no,
        qty: it.qty, price: it.price, currency: cur, priceEgp: atRate(it.price, cur, r.date),
        delta: r.kind === 'SALE' ? it.qty : -it.qty, balance: null,
      });
    }
    for (const a of adjustments as any[]) {
      rows.push({
        id: a.uid, date: a.date, kind: a.qty >= 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT', party: a.note ?? null, warehouse: a.warehouse?.name ?? null, no: '',
        qty: Math.abs(a.qty), price: null, currency: 'EGP', priceEgp: null, delta: a.qty, balance: null,
      });
    }
    for (const l of loans as any[]) {
      const who = l.party?.name ?? l.borrowerName ?? null;
      rows.push({
        id: l.uid, date: l.date, kind: 'LOAN', party: who, warehouse: l.warehouse?.name ?? null, no: '',
        qty: l.qty, price: null, currency: 'EGP', priceEgp: null, delta: -l.qty, balance: null,
      });
      // البضاعة الراجعة: بتاريخ كل رجوع، والقديم المسجّل من غير تفاصيل بتاريخ الرجوع.
      let detailed = 0;
      for (const ret of l.returns) {
        detailed += ret.qty;
        rows.push({
          id: ret.uid, date: ret.date, kind: 'LOAN_RETURN', party: who, warehouse: l.warehouse?.name ?? null, no: '',
          qty: ret.qty, price: null, currency: 'EGP', priceEgp: null, delta: ret.qty, balance: null,
        });
      }
      const legacy = (l.returnedQty ?? 0) - detailed;
      if (legacy > 1e-9) {
        rows.push({
          id: `${l.uid}-r`, date: l.returnDate ?? l.date, kind: 'LOAN_RETURN', party: who, warehouse: l.warehouse?.name ?? null, no: '',
          qty: legacy, price: null, currency: 'EGP', priceEgp: null, delta: legacy, balance: null,
        });
      }
    }

    // من الأقدم: نفس اليوم الوارد قبل المنصرف، وبعدين نعرض من الأحدث.
    rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || b.delta - a.delta);
    let balance = 0;
    for (const r of rows) {
      balance += r.delta;
      r.balance = r.warehouse === 'بيع خارجي' || r.fake ? null : balance;
    }
    return rows.reverse().map(({ delta: _d, ...r }) => r);
  }

  /** دمج أصناف في صنف أساسي. الخدمي لا يُدمج مع صنف مخزني، لأن المخزون يُحسب للمخزني فقط. */
  async merge(dto: MergeProductsDto) {
    const sourceUids = [...new Set(dto.sourceIds)].filter((u) => u !== dto.targetId);
    if (!sourceUids.length) throw new BadRequestException('اختر صنفاً واحداً على الأقل غير الصنف الأساسي');
    const target = await this.repo.findOne(dto.targetId);
    if (!target) throw new NotFoundException('الصنف الأساسي غير موجود');
    const sources = await Promise.all(sourceUids.map((u) => this.repo.findOne(u)));
    if (sources.some((s) => !s)) throw new NotFoundException('أحد الأصناف المختارة غير موجود');
    const mixed = sources.find((s) => s!.service !== target.service);
    if (mixed) {
      throw new BadRequestException(`لا يمكن دمج «${mixed.name}» مع «${target.name}»: أحدهما خدمي والآخر مخزني`);
    }
    return this.repo.merge(target.id, sources.map((s) => s!.id));
  }

  create(dto: CreateProductDto) { return this.repo.create(dto); }
  update(id: string, dto: UpdateProductDto) { return this.repo.update(id, dto); }

  async remove(id: string, mode: DeleteMode) {
    const prod = await this.repo.findByUid(id);
    if (!prod) throw new NotFoundException('Product not found');

    const [hard, soft] = await Promise.all([
      this.repo.countHardBlockers(prod.id),
      this.repo.countCascadeEligible(prod.id),
    ]);
    const related = hard + soft;

    // Nothing points at it — a real delete leaves nothing behind, so don't ask.
    if (related === 0) return this.repo.removeCascade(prod.id);

    // "شيله وسيب المعاملات" — the invoice items keep resolving the name through the
    // relation, the product just stops appearing anywhere you'd pick it.
    if (mode === 'archive') return this.repo.archive(prod.id);

    if (mode === 'cascade') {
      // Invoice/deal items are other people's paperwork; cascading through them would
      // silently rewrite invoices, so this stays impossible however it's asked for.
      if (hard > 0) throw new ConflictException(deleteConflict(`الصنف «${prod.name}»`, related, false));
      return this.repo.removeCascade(prod.id);
    }

    throw new ConflictException(deleteConflict(`الصنف «${prod.name}»`, related, hard === 0));
  }
}
