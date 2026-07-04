import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLoanDto, ReturnLoanDto } from './dto/loans.dto';

const include = {
  product: true,
  warehouse: true,
  party: { select: { uid: true, name: true, role: true } },
  returns: { orderBy: { date: 'asc' as const } },
};

@Injectable()
export class LoansRepository {
  constructor(private prisma: PrismaService) {}

  findProductByUid(uid: string) {
    return this.prisma.product.findUnique({ where: { uid } });
  }

  findWarehouseByUid(uid: string) {
    return this.prisma.warehouse.findUnique({ where: { uid } });
  }

  findPartyByUid(uid: string) {
    return this.prisma.party.findUnique({ where: { uid } });
  }

  createLoan(data: {
    date: Date; borrowerName: string | null; partyId: number | null;
    qty: number; note: string | null; productId: number; warehouseId: number; status: string;
  }) {
    return this.prisma.loan.create({ data: data as any, include });
  }

  findAll(where: any) {
    return this.prisma.loan.findMany({ where, include, orderBy: { date: 'desc' } });
  }

  findByUid(uid: string) {
    return this.prisma.loan.findUnique({ where: { uid }, include });
  }

  findTreasuryByUid(uid: string) {
    return this.prisma.treasuryAccount.findUnique({ where: { uid } });
  }

  async createCashReturnTx(data: {
    date: Date; cashIn: number; treasuryId: number;
    borrowerLabel: string; productName: string; qty: number; returnNote?: string;
  }) {
    return this.prisma.transaction.create({
      data: {
        date: data.date, type: 'loanReturn', cashIn: data.cashIn,
        treasuryId: data.treasuryId,
        note: `استرداد عارية (فلوس) — ${data.borrowerLabel} — ${data.productName} × ${data.qty}${data.returnNote ? ' — ' + data.returnNote : ''}`,
      },
    });
  }

  async createDebtReturnTx(data: {
    date: Date; debit: number; partyId: number;
    productName: string; qty: number; returnNote?: string;
  }) {
    return this.prisma.transaction.create({
      data: {
        date: data.date, type: 'loanDebt', debit: data.debit, partyId: data.partyId,
        note: `دين عارية — ${data.productName} × ${data.qty}${data.returnNote ? ' — ' + data.returnNote : ''}`,
      },
    });
  }

  createLoanReturn(data: {
    loanId: number; date: Date; returnType: string; qty: number;
    pricePerUnit: number | null; note: string | null; txId: number | null;
  }) {
    return this.prisma.loanReturn.create({ data: data as any });
  }

  updateLoan(uid: string, data: {
    returnedQty: number; cashReturnedQty: number; returnDate: Date;
    returnNote: string | null; status?: string; returnType?: string;
  }) {
    return this.prisma.loan.update({ where: { uid }, data: data as any, include });
  }

  remove(uid: string) {
    return this.prisma.loan.delete({ where: { uid } });
  }
}
