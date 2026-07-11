import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceKind } from '@prisma/client'; // used by create()
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateInvoiceDto, UpdateInvoiceDto, CommissionDto } from './dto/invoices.dto';
import { InvoicesRepository } from './invoices.repository';

@Injectable()
export class InvoicesService {
  constructor(private repo: InvoicesRepository) {}

  findAll(q: PaginationQueryDto, kind?: InvoiceKind) { return this.repo.findAll(q, kind); }

  async findOne(id: string) {
    const inv = await this.repo.findOne(id);
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  create(dto: CreateInvoiceDto, createdById?: number) {
    const total = dto.items.reduce((s, it) => s + it.qty * it.price, 0);
    const paid = dto.paid || 0;
    const isSale = dto.kind === InvoiceKind.SALE;
    return this.repo.create(dto, { total, paid, isSale, createdById });
  }

  update(id: string, dto: UpdateInvoiceDto, createdById?: number) {
    const total = dto.items.reduce((s, it) => s + it.qty * it.price, 0);
    const paid = dto.paid ?? 0;
    return this.repo.update(id, dto, { total, paid, createdById });
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
