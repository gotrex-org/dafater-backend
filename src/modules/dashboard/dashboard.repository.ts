import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardRepository {
  constructor(private prisma: PrismaService) {}

  findAllParties() {
    return this.prisma.party.findMany();
  }

  findAllWarehouses() {
    return this.prisma.warehouse.findMany();
  }

  countProducts() {
    return this.prisma.product.count();
  }

  countInvoices() {
    return this.prisma.invoice.count();
  }
}
