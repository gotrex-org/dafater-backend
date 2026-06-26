import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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

  deletePayment(uid: string) {
    return this.prisma.driverPayment.delete({ where: { uid } });
  }

  createDelayTx(data: { date: Date; type: string; debit: number; partyId: number; note: string }) {
    return this.prisma.transaction.create({ data });
  }

  remove(uid: string) {
    return this.prisma.driverTrip.delete({ where: { uid } });
  }
}
