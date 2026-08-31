import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceKind } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateProductDto, UpdateProductDto } from './dto/products.dto';
import { ProductsRepository } from './products.repository';
import { deleteConflict, type DeleteMode } from '../../common/delete-mode';

@Injectable()
export class ProductsService {
  constructor(private repo: ProductsRepository) {}

  catalog() { return this.repo.catalog(); }
  findAll(q: PaginationQueryDto) { return this.repo.findAll(q); }
  findOne(id: string) { return this.repo.findOne(id); }
  lastPrices(kind: InvoiceKind) { return this.repo.lastPrices(kind); }

  async movements(uid: string) {
    const result = await this.repo.movements(uid);
    if (!result || Array.isArray(result)) return [];
    const { items, dealItems } = result;
    const rows = [
      ...items.map((it: any) => ({
        id: it.uid, date: it.invoice.date, kind: it.invoice.kind,
        party: it.invoice.party?.name ?? null, warehouse: it.invoice.warehouse?.name ?? null,
        no: it.invoice.no, qty: it.qty, price: it.price,
      })),
      ...dealItems.flatMap((it: any) => [
        { id: `${it.uid}-b`, date: it.deal.date, kind: 'PURCHASE' as const, party: it.deal.supplier?.name ?? null, warehouse: 'بيع خارجي', no: it.deal.no, qty: it.qty, price: it.buyPrice },
        { id: `${it.uid}-s`, date: it.deal.date, kind: 'SALE' as const, party: it.deal.client?.name ?? null, warehouse: 'بيع خارجي', no: it.deal.no, qty: it.qty, price: it.price },
      ]),
    ];
    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
