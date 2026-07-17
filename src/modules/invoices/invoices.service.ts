import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
