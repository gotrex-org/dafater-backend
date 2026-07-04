import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { deleteTransactionAndEffects } from '../../common/transaction-cascade';

const include = {
  manifest: { select: { uid: true, no: true } },
  party: { select: { uid: true, name: true } },
  payments: { orderBy: { date: 'asc' as const } },
};

@Injectable()
export class DriverTripsRepository {
  constructor(private prisma: PrismaService) {}

  findManifestByUid(uid: string) {
    return this.prisma.manifest.findUnique({ where: { uid } });
  }

  findPartyByUid(uid: string) {
    return this.prisma.party.findUnique({ where: { uid } });
  }

  findTreasuryByUid(uid: string) {
    return this.prisma.treasuryAccount.findUnique({ where: { uid } });
  }

  createTrip(data: {
    manifestId: number | null; partyId: number | null; driverName: string;
    vehicleNo: string | null; trailerNo: string | null; clientName: string;
    departureDate: Date; agreedFreight: number; note: string | null;
  }) {
    return this.prisma.driverTrip.create({ data, include });
  }

  createPayment(data: { tripId: number; date: Date; amount: number; paymentType: string; note: string | null }) {
    return this.prisma.driverPayment.create({ data });
  }

  createTreasuryTx(data: { date: Date; type: string; cashOut: number; treasuryId: number; note: string }) {
    return this.prisma.transaction.create({ data });
  }

  // Creates a DriverPayment and (if a treasury tx is given) its paired treasury
  // Transaction atomically, linking them via DriverPayment.txId so deleting
  // either one cascades to the other — see transaction-cascade.ts.
  createPaymentWithTreasuryTx(
    payment: { tripId: number; date: Date; amount: number; paymentType: string; note: string | null },
    treasuryTx?: { date: Date; type: string; cashOut: number; treasuryId: number; note: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const createdTx = treasuryTx ? await tx.transaction.create({ data: treasuryTx }) : null;
      return tx.driverPayment.create({ data: { ...payment, txId: createdTx?.id ?? null } });
    });
  }

  findAll() {
    return this.prisma.driverTrip.findMany({ include, orderBy: { createdAt: 'desc' } });
  }

  findByUid(uid: string) {
    return this.prisma.driverTrip.findUnique({ where: { uid }, include });
  }

  update(uid: string, data: any) {
    return this.prisma.driverTrip.update({ where: { uid }, data, include });
  }

  findPaymentByUid(uid: string) {
    return this.prisma.driverPayment.findUnique({ where: { uid } });
  }

  async deletePayment(uid: string) {
    const payment = await this.prisma.driverPayment.findUniqueOrThrow({ where: { uid } });
    if (payment.txId) {
      // cascades to the paired treasury Transaction, which in turn deletes this payment
      await deleteTransactionAndEffects(this.prisma, payment.txId);
    } else {
      await this.prisma.driverPayment.delete({ where: { uid } });
    }
  }

  createDelayTx(data: { date: Date; type: string; debit: number; partyId: number; note: string }) {
    return this.prisma.transaction.create({ data });
  }

  updateTransactionById(id: number, debit: number) {
    return this.prisma.transaction.update({ where: { id }, data: { debit } });
  }

  updateTransactionAmountDate(id: number, debit: number, date: Date) {
    return this.prisma.transaction.update({ where: { id }, data: { debit, date } });
  }

  // Retires a delay/weight-diff charge transaction that's no longer owed
  // (e.g. arrival date corrected so the recomputed fee is 0). Also nulls out
  // the driverTrip.delayTxId/weightDiffTxId pointer — see transaction-cascade.ts.
  deleteTransaction(id: number) {
    return deleteTransactionAndEffects(this.prisma, id);
  }

  remove(uid: string) {
    return this.prisma.driverTrip.delete({ where: { uid } });
  }
}
