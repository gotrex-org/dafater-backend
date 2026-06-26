import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateLoanDto, ReturnLoanDto } from './dto/loans.dto';
import { LoansRepository } from './loans.repository';

@Injectable()
export class LoansService {
  constructor(private repo: LoansRepository) {}

  async create(dto: CreateLoanDto) {
    const product = await this.repo.findProductByUid(dto.productId);
    if (!product) throw new NotFoundException('الصنف غير موجود');
    const warehouse = await this.repo.findWarehouseByUid(dto.warehouseId);
    if (!warehouse) throw new NotFoundException('المخزن غير موجود');

    let partyId: number | null = null;
    let resolvedName = dto.borrowerName?.trim() ?? '';
    if (dto.partyId) {
      const party = await this.repo.findPartyByUid(dto.partyId);
      if (party) { partyId = party.id; if (!resolvedName) resolvedName = party.name; }
    }
    if (!resolvedName && !partyId) throw new BadRequestException('يجب تحديد المستعير');

    return this.repo.createLoan({
      date: new Date(dto.date),
      borrowerName: resolvedName || null,
      partyId,
      qty: dto.qty,
      note: dto.note ?? null,
      productId: product.id,
      warehouseId: warehouse.id,
      status: 'OPEN',
    });
  }

  async findAll(opts: { warehouseId?: string; status?: string }) {
    const where: any = {};
    if (opts.warehouseId) {
      const wh = await this.repo.findWarehouseByUid(opts.warehouseId);
      if (wh) where.warehouseId = wh.id;
    }
    if (opts.status) where.status = opts.status;
    return this.repo.findAll(where);
  }

  async returnLoan(uid: string, dto: ReturnLoanDto) {
    const loan = await this.repo.findByUid(uid);
    if (!loan) throw new NotFoundException('العارية غير موجودة');
    if (loan.status !== 'OPEN') throw new BadRequestException('تم استرداد هذه العارية مسبقًا');

    const remaining = loan.qty - (loan.returnedQty ?? 0) - (loan.cashReturnedQty ?? 0);
    if (dto.returnedQty > remaining + 0.001)
      throw new BadRequestException('الكمية أكبر من المتبقية (' + remaining + ')');

    if ((dto.returnType === 'CASH' || dto.returnType === 'DEBT') && (!dto.pricePerUnit || dto.pricePerUnit <= 0))
      throw new BadRequestException('يجب تحديد سعر القطعة');
    if (dto.returnType === 'CASH' && !dto.treasuryId)
      throw new BadRequestException('يجب اختيار الخزنة');

    const isGoods = dto.returnType === 'GOODS';
    const newGoodsReturned = (loan.returnedQty ?? 0) + (isGoods ? dto.returnedQty : 0);
    const newCashReturned  = (loan.cashReturnedQty ?? 0) + (!isGoods ? dto.returnedQty : 0);
    const isFull = newGoodsReturned + newCashReturned >= loan.qty - 0.001;
    const closingReturnType =
      newGoodsReturned > 0 && newCashReturned > 0 ? 'MIXED' :
      newCashReturned > 0 ? dto.returnType : 'GOODS';

    const borrowerLabel = (loan as any).party?.name ?? loan.borrowerName ?? '';
    const productName = (loan as any).product?.name ?? '';
    let txId: number | null = null;

    if (dto.returnType === 'CASH') {
      const treasury = await this.repo.findTreasuryByUid(dto.treasuryId!);
      if (!treasury) throw new BadRequestException('الخزنة غير موجودة');
      const tx = await this.repo.createCashReturnTx({
        date: new Date(dto.returnDate),
        cashIn: dto.returnedQty * dto.pricePerUnit!,
        treasuryId: treasury.id,
        borrowerLabel, productName,
        qty: dto.returnedQty,
        returnNote: dto.returnNote,
      });
      txId = tx.id;
    }

    if (dto.returnType === 'DEBT') {
      let debtPartyId = (loan as any).partyId as number | null;
      if (!debtPartyId && dto.debtPartyId) {
        const p = await this.repo.findPartyByUid(dto.debtPartyId);
        debtPartyId = p?.id ?? null;
      }
      if (!debtPartyId) throw new BadRequestException('يجب ربط العارية بعميل أو مورد لتسجيل الدين');
      const tx = await this.repo.createDebtReturnTx({
        date: new Date(dto.returnDate),
        debit: dto.returnedQty * dto.pricePerUnit!,
        partyId: debtPartyId,
        productName,
        qty: dto.returnedQty,
        returnNote: dto.returnNote,
      });
      txId = tx.id;
    }

    await this.repo.createLoanReturn({
      loanId: loan.id,
      date: new Date(dto.returnDate),
      returnType: dto.returnType,
      qty: dto.returnedQty,
      pricePerUnit: dto.pricePerUnit ?? null,
      note: dto.returnNote ?? null,
      txId,
    });

    return this.repo.updateLoan(uid, {
      returnedQty:     newGoodsReturned,
      cashReturnedQty: newCashReturned,
      returnDate:      new Date(dto.returnDate),
      returnNote:      dto.returnNote ?? null,
      ...(isFull ? { status: 'RETURNED', returnType: closingReturnType } : {}),
    });
  }

  async remove(uid: string) {
    const loan = await this.repo.findByUid(uid);
    if (!loan) throw new NotFoundException('العارية غير موجودة');
    if (loan.status !== 'OPEN') throw new BadRequestException('لا يمكن حذف عارية تم استردادها');
    return this.repo.remove(uid);
  }
}
