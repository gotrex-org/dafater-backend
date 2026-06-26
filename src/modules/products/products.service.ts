import { Injectable } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateProductDto, UpdateProductDto } from './dto/products.dto';
import { ProductsRepository } from './products.repository';

@Injectable()
export class ProductsService {
  constructor(private repo: ProductsRepository) {}

  catalog() { return this.repo.catalog(); }
  findAll(q: PaginationQueryDto) { return this.repo.findAll(q); }
  findOne(id: string) { return this.repo.findOne(id); }

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
  remove(id: string) { return this.repo.remove(id); }
}
