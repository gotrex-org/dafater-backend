import { Injectable, NotFoundException } from '@nestjs/common';
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

  create(dto: CreateInvoiceDto) {
    const total = dto.items.reduce((s, it) => s + it.qty * it.price, 0);
    const paid = dto.paid || 0;
    const isSale = dto.kind === InvoiceKind.SALE;
    return this.repo.create(dto, { total, paid, isSale });
  }

  update(id: string, dto: UpdateInvoiceDto) {
    const total = dto.items.reduce((s, it) => s + it.qty * it.price, 0);
    const paid = dto.paid ?? 0;
    return this.repo.update(id, dto, { total, paid });
  }

  updateCommission(uid: string, dto: CommissionDto) { return this.repo.updateCommission(uid, dto); }
  remove(id: string) { return this.repo.remove(id); }
  peekNextNo(partyUid: string) { return this.repo.peekNextNo(partyUid); }
}
