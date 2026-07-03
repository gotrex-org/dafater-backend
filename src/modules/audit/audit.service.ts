import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { AuditRepository } from './audit.repository';

@Injectable()
export class AuditService {
  constructor(
    private repo: AuditRepository,
    private prisma: PrismaService,
  ) {}

  findAll(q: PaginationQueryDto, user?: string) {
    return this.repo.findAll(q, user);
  }

  findTrash(q: PaginationQueryDto) {
    return this.repo.findTrash(q);
  }

  async undo(auditUid: string) {
    const log = await this.repo.findOneByUid(auditUid);

    if (log.action === 'CREATE') {
      if (!log.entityUid) throw new BadRequestException('لا يوجد رابط للحركة');
      await this.deleteEntityByUid(log.entity, log.entityUid);
      await this.repo.deleteByUid(auditUid);
      return { ok: true };
    }

    if (log.action === 'DELETE') {
      if (!log.snapshot) throw new BadRequestException('لا توجد بيانات محفوظة لاسترجاع هذه الحركة');
      await this.restoreEntity(log.entity, log.snapshot as any);
      await this.repo.deleteByUid(auditUid);
      return { ok: true };
    }

    throw new BadRequestException('التراجع عن التعديلات غير مدعوم حالياً');
  }

  // ── DELETE the entity that was created (undo CREATE) ──────────────────────

  private deleteEntityByUid(entity: string, uid: string) {
    const map: Record<string, () => Promise<any>> = {
      transactions:         () => this.prisma.transaction.delete({ where: { uid } }),
      invoices:             () => this.prisma.invoice.delete({ where: { uid } }),
      deals:                () => this.prisma.deal.delete({ where: { uid } }),
      manifests:            () => this.prisma.manifest.delete({ where: { uid } }),
      'driver-trips':       () => this.prisma.driverTrip.delete({ where: { uid } }),
      parties:              () => this.prisma.party.delete({ where: { uid } }),
      products:             () => this.prisma.product.delete({ where: { uid } }),
      'expense-categories': () => this.prisma.expenseCategory.delete({ where: { uid } }),
      adjustments:          () => this.prisma.adjustment.delete({ where: { uid } }),
      treasury:             () => this.prisma.treasuryAccount.delete({ where: { uid } }),
      drivers:              () => this.prisma.driver.delete({ where: { uid } }),
      warehouses:           () => this.prisma.warehouse.delete({ where: { uid } }),
      loans:                () => this.prisma.loan.delete({ where: { uid } }),
      orders:               () => this.prisma.order.delete({ where: { uid } }),
      requests:             () => this.prisma.request.delete({ where: { uid } }),
      'dollar-agents':      () => this.prisma.dollarAgent.delete({ where: { uid } }),
    };
    const fn = map[entity];
    if (!fn) throw new BadRequestException(`إلغاء إنشاء "${entity}" غير مدعوم`);
    return fn();
  }

  // ── RESTORE the entity from its snapshot (undo DELETE) ────────────────────

  private restoreEntity(entity: string, snap: any) {
    switch (entity) {
      case 'invoices':             return this.restoreInvoice(snap);
      case 'deals':                return this.restoreDeal(snap);
      case 'transactions':         return this.restoreTransaction(snap);
      case 'manifests':            return this.restoreManifest(snap);
      case 'driver-trips':         return this.restoreDriverTrip(snap);
      case 'parties':              return this.restoreParty(snap);
      case 'products':             return this.restoreProduct(snap);
      case 'expense-categories':   return this.restoreExpenseCategory(snap);
      case 'adjustments':          return this.restoreAdjustment(snap);
      case 'treasury':             return this.restoreTreasury(snap);
      case 'drivers':              return this.restoreDriver(snap);
      case 'warehouses':           return this.restoreWarehouse(snap);
      case 'loans':                return this.restoreLoan(snap);
      case 'orders':               return this.restoreOrder(snap);
      case 'requests':             return this.restoreRequest(snap);
      case 'dollar-agents':        return this.restoreDollarAgent(snap);
      default: throw new BadRequestException(`استرجاع "${entity}" غير مدعوم`);
    }
  }

  private restoreInvoice(snap: any) {
    const { items = [], transactions: txns = [], id: _id, createdAt: _c, updatedAt: _u, ...inv } = snap;
    return this.prisma.invoice.create({
      data: {
        uid: inv.uid,
        kind: inv.kind,
        no: inv.no,
        date: new Date(inv.date),
        partyId: inv.partyId,
        warehouseId: inv.warehouseId,
        currency: inv.currency ?? 'EGP',
        paid: inv.paid ?? 0,
        treasuryId: inv.treasuryId ?? null,
        note: inv.note ?? null,
        commissionAmount: inv.commissionAmount ?? null,
        commissionTo: inv.commissionTo ?? null,
        items: {
          createMany: {
            data: items.map((it: any) => ({
              uid: it.uid,
              productId: it.productId,
              qty: it.qty,
              price: it.price,
            })),
          },
        },
        transactions: {
          createMany: {
            data: txns.map((t: any) => this.txnData(t)),
          },
        },
      },
    });
  }

  private restoreDeal(snap: any) {
    const { items = [], transactions: txns = [], id: _id, createdAt: _c, updatedAt: _u, ...deal } = snap;
    return this.prisma.deal.create({
      data: {
        uid: deal.uid,
        no: deal.no,
        date: new Date(deal.date),
        clientId: deal.clientId,
        supplierId: deal.supplierId,
        paidIn: deal.paidIn ?? 0,
        paidOut: deal.paidOut ?? 0,
        nawlon: deal.nawlon ?? 0,
        treasuryId: deal.treasuryId ?? null,
        note: deal.note ?? null,
        items: {
          createMany: {
            data: items.map((it: any) => ({
              uid: it.uid,
              productId: it.productId,
              qty: it.qty,
              price: it.price,
            })),
          },
        },
        transactions: {
          createMany: {
            data: txns.map((t: any) => this.txnData(t)),
          },
        },
      },
    });
  }

  private restoreTransaction(snap: any) {
    const { id: _id, createdAt: _c, invoice: _inv, deal: _deal, party: _p, treasury: _t, treasury2: _t2, category: _cat, ...t } = snap;
    return this.prisma.transaction.create({ data: { ...t, date: new Date(t.date) } });
  }

  private restoreManifest(snap: any) {
    const { items = [], id: _id, createdAt: _c, updatedAt: _u, invoice: _inv, driverTrips: _dt, ...m } = snap;
    return this.prisma.manifest.create({
      data: {
        ...m,
        date: new Date(m.date),
        items: {
          createMany: {
            data: items.map((it: any) => ({
              uid: it.uid,
              name: it.name,
              qty: it.qty,
            })),
          },
        },
      },
    });
  }

  private restoreDriverTrip(snap: any) {
    const { payments = [], id: _id, createdAt: _c, updatedAt: _u, party: _p, manifest: _m, ...t } = snap;
    return this.prisma.driverTrip.create({
      data: {
        ...t,
        departureDate: new Date(t.departureDate),
        arrivalDate: t.arrivalDate ? new Date(t.arrivalDate) : null,
        payments: {
          createMany: {
            data: payments.map((pay: any) => ({
              uid: pay.uid,
              date: new Date(pay.date),
              amount: pay.amount,
              paymentType: pay.paymentType ?? 'freight',
              note: pay.note ?? null,
            })),
          },
        },
      },
    });
  }

  private async restoreParty(snap: any) {
    const { transactions: txns = [], requests: reqs = [], id: _id, createdAt: _c, updatedAt: _u, ...p } = snap;

    return this.prisma.$transaction(async (tx) => {
      const party = await tx.party.create({ data: p });

      // Restore cascade-deleted transactions, replacing the old integer partyId
      if (txns.length) {
        await tx.transaction.createMany({
          data: txns.map((t: any) => {
            const { id: _i, partyId: _old, invoice: _inv, deal: _deal, party: _pa, treasury: _tr, treasury2: _t2, category: _cat, ...rest } = t;
            return { ...rest, partyId: party.id, date: new Date(t.date) };
          }),
        });
      }

      // Restore cascade-deleted requests (with their items)
      for (const req of reqs) {
        const { items: reqItems = [], id: _ri, createdAt: _rc, client: _cl, clientId: _old, ...r } = req;
        const restored = await tx.request.create({
          data: {
            ...r,
            clientId: party.id,
            date: new Date(r.date),
            doneDate: r.doneDate ? new Date(r.doneDate) : null,
          },
        });
        if (reqItems.length) {
          await tx.requestItem.createMany({
            data: reqItems.map((it: any) => {
              const { id: _i, requestId: _old, request: _r, ...itRest } = it;
              return { ...itRest, requestId: restored.id };
            }),
          });
        }
      }

      return party;
    });
  }

  private restoreProduct(snap: any) {
    const { id: _id, createdAt: _c, updatedAt: _u, ...p } = snap;
    return this.prisma.product.create({ data: p });
  }

  private restoreExpenseCategory(snap: any) {
    const { id: _id, createdAt: _c, updatedAt: _u, ...c } = snap;
    return this.prisma.expenseCategory.create({ data: c });
  }

  private restoreAdjustment(snap: any) {
    const { id: _id, createdAt: _c, product: _p, warehouse: _w, ...a } = snap;
    return this.prisma.adjustment.create({ data: { ...a, date: new Date(a.date) } });
  }

  private async restoreTreasury(snap: any) {
    const {
      id: _id, createdAt: _c, updatedAt: _u,
      transactions: txns = [],
      transactionsAlt: txnsAlt = [],
      invoices: invs = [],
      deals: dls = [],
      ...t
    } = snap;

    const created = await this.prisma.treasuryAccount.create({ data: t });

    await this.prisma.$transaction(async (tx) => {
      if (txns.length)
        await tx.transaction.updateMany({ where: { uid: { in: txns.map((x: any) => x.uid) } }, data: { treasuryId: created.id } });
      if (txnsAlt.length)
        await tx.transaction.updateMany({ where: { uid: { in: txnsAlt.map((x: any) => x.uid) } }, data: { treasuryId2: created.id } });
      if (invs.length)
        await tx.invoice.updateMany({ where: { uid: { in: invs.map((x: any) => x.uid) } }, data: { treasuryId: created.id } });
      if (dls.length)
        await tx.deal.updateMany({ where: { uid: { in: dls.map((x: any) => x.uid) } }, data: { treasuryId: created.id } });
    });

    return created;
  }

  private restoreDriver(snap: any) {
    const { id: _id, createdAt: _c, updatedAt: _u, ...d } = snap;
    return this.prisma.driver.create({ data: d });
  }

  private restoreWarehouse(snap: any) {
    const { id: _id, createdAt: _c, updatedAt: _u, ...w } = snap;
    return this.prisma.warehouse.create({ data: w });
  }

  private restoreLoan(snap: any) {
    const { returns: rets = [], id: _id, createdAt: _c, party: _p, product: _pr, warehouse: _w, ...l } = snap;
    return this.prisma.loan.create({
      data: {
        ...l,
        date: new Date(l.date),
        returnDate: l.returnDate ? new Date(l.returnDate) : null,
        returns: {
          createMany: {
            data: rets.map((r: any) => {
              const { id: _i, loanId: _old, loan: _ln, ...rRest } = r;
              return { ...rRest, date: new Date(r.date) };
            }),
          },
        },
      },
    });
  }

  private restoreOrder(snap: any) {
    const { items = [], id: _id, createdAt: _c, party: _p, ...o } = snap;
    return this.prisma.order.create({
      data: {
        ...o,
        date: new Date(o.date),
        items: {
          createMany: {
            data: items.map((it: any) => {
              const { id: _i, orderId: _old, order: _o, ...itRest } = it;
              return itRest;
            }),
          },
        },
      },
    });
  }

  private restoreRequest(snap: any) {
    const { items = [], id: _id, createdAt: _c, client: _cl, ...r } = snap;
    return this.prisma.request.create({
      data: {
        ...r,
        date: new Date(r.date),
        doneDate: r.doneDate ? new Date(r.doneDate) : null,
        items: {
          createMany: {
            data: items.map((it: any) => {
              const { id: _i, requestId: _old, request: _r, ...itRest } = it;
              return itRest;
            }),
          },
        },
      },
    });
  }

  private restoreDollarAgent(snap: any) {
    const { txs = [], id: _id, createdAt: _c, updatedAt: _u, ...a } = snap;
    return this.prisma.dollarAgent.create({
      data: {
        ...a,
        txs: {
          createMany: {
            data: txs.map((t: any) => {
              const { id: _i, agentId: _old, agent: _ag, party: _p, treasury: _tr, ...tRest } = t;
              return { ...tRest, date: new Date(t.date) };
            }),
          },
        },
      },
    });
  }

  // Strip relation objects & auto-generated fields from transaction snapshot
  private txnData(t: any) {
    const { id, invoiceId: _inv, dealId: _deal, invoice, deal, party, treasury, treasury2, category, ...rest } = t;
    return { ...rest, date: new Date(t.date) };
  }
}
