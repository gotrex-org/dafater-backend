import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

const ACTION: Record<string, string> = { POST: 'CREATE', PATCH: 'UPDATE', PUT: 'UPDATE', DELETE: 'DELETE' };
const SKIP = new Set(['auth', 'audit']);

// UID pattern (cuid / cuid2)
const UID_RE = /^c[a-z0-9]{20,}$/;

// Fields to snapshot BEFORE an update, keyed by entity string from URL
const BEFORE_FETCH: Record<
  string,
  (p: PrismaService, uid: string) => Promise<Record<string, any> | null>
> = {
  invoices: (p, uid) => p.invoice.findUnique({
    where: { uid },
    select: {
      date: true, paid: true, note: true,
      party: { select: { name: true } },
      warehouse: { select: { name: true } },
      items: { select: { productId: true, qty: true, price: true, product: { select: { name: true } } } },
    },
  }),
  parties:       (p, uid) => p.party.findUnique({ where: { uid }, select: { name: true, phone: true } }),
  manifests:     (p, uid) => p.manifest.findUnique({ where: { uid }, select: { clientName: true, driverName: true, vehicleNo: true, trailerNo: true, note: true } }),
  deals: (p, uid) => p.deal.findUnique({
    where: { uid },
    select: {
      date: true, note: true,
      client: { select: { name: true } },
      supplier: { select: { name: true } },
      items: { select: { productId: true, qty: true, price: true, product: { select: { name: true } } } },
    },
  }),
  products:      (p, uid) => p.product.findUnique({ where: { uid }, select: { name: true, unit: true } }),
  'driver-trips':(p, uid) => p.driverTrip.findUnique({ where: { uid }, select: { driverName: true, agreedFreight: true, note: true } }),
  requests:      (p, uid) => p.request.findUnique({ where: { uid }, select: { done: true, note: true } }),
  treasury:      (p, uid) => p.treasuryAccount.findUnique({ where: { uid }, select: { name: true, opening: true, currency: true } }),
  warehouses:    (p, uid) => p.warehouse.findUnique({ where: { uid }, select: { name: true } }),
  'expense-categories': (p, uid) => p.expenseCategory.findUnique({ where: { uid }, select: { name: true } }),
  drivers:       (p, uid) => p.driver.findUnique({ where: { uid }, select: { name: true, phone: true, phone2: true, vehicleNo: true, trailerNo: true, note: true } }),
  // Never select pinHash — audit snapshots must not carry credential material.
  users:         (p, uid) => p.user.findUnique({ where: { uid }, select: { name: true, admin: true, views: true, role: true } }),
  loans:         (p, uid) => p.loan.findUnique({ where: { uid }, select: { status: true, returnedQty: true, cashReturnedQty: true, note: true } }),
  orders:        (p, uid) => p.order.findUnique({ where: { uid }, select: { name: true, phone: true, note: true, status: true } }),
};

// Full entity snapshot BEFORE a DELETE — used for undo/restore
const DELETE_FETCH: Record<
  string,
  (p: PrismaService, uid: string) => Promise<any>
> = {
  // Deleting one transaction can cascade to its whole group (see
  // transaction-cascade.ts) — snapshot every sibling sharing the groupId, not
  // just the one at the URL, so undo restores the whole group.
  transactions:         async (p, uid) => {
    const include = { party: true, treasury: true, treasury2: true, category: true } as const;
    const txn = await p.transaction.findUnique({ where: { uid }, include });
    if (!txn) return null;
    return txn.groupId ? p.transaction.findMany({ where: { groupId: txn.groupId }, include }) : [txn];
  },
  invoices:             (p, uid) => p.invoice.findUnique({ where: { uid }, include: { items: true, transactions: true } }),
  deals:                (p, uid) => p.deal.findUnique({ where: { uid }, include: { items: true, transactions: true } }),
  manifests:            (p, uid) => p.manifest.findUnique({ where: { uid }, include: { items: true } }),
  'driver-trips':       (p, uid) => p.driverTrip.findUnique({ where: { uid }, include: { payments: true } }),
  parties:              (p, uid) => p.party.findUnique({ where: { uid }, include: { transactions: true, requests: { include: { items: true } } } }),
  products:             (p, uid) => p.product.findUnique({ where: { uid } }),
  'expense-categories': (p, uid) => p.expenseCategory.findUnique({ where: { uid } }),
  adjustments:          (p, uid) => p.adjustment.findUnique({ where: { uid } }),
  drivers:              (p, uid) => p.driver.findUnique({ where: { uid } }),
  warehouses:           (p, uid) => p.warehouse.findUnique({ where: { uid } }),
  loans:                (p, uid) => p.loan.findUnique({ where: { uid }, include: { returns: true } }),
  orders:               (p, uid) => p.order.findUnique({ where: { uid }, include: { items: true } }),
  requests:             (p, uid) => p.request.findUnique({ where: { uid }, include: { items: true } }),
  'dollar-agents':      (p, uid) => p.dollarAgent.findUnique({ where: { uid }, include: { txs: true } }),
  treasury: (p, uid) => p.treasuryAccount.findUnique({
    where: { uid },
    include: {
      transactions:    { select: { uid: true } },
      transactionsAlt: { select: { uid: true } },
      invoices:        { select: { uid: true } },
      deals:           { select: { uid: true } },
    },
  }),
};

// Normalise a value so dates compare as YYYY-MM-DD strings
function norm(v: any): any {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 10);
  return v;
}

function computeDiff(
  before: Record<string, any>,
  after: Record<string, any>,
): Record<string, { from: any; to: any }> | undefined {
  const changes: Record<string, { from: any; to: any }> = {};
  for (const key of Object.keys(before)) {
    const from = norm(before[key]);
    const to   = norm(after[key]);
    if (after[key] !== undefined && to !== from) {
      changes[key] = { from, to };
    }
  }
  return Object.keys(changes).length ? changes : undefined;
}

// Invoice/deal line items are fully replaced on every update (deleteMany + create),
// so item rows get a new uid each time — match before/after by productId instead.
function computeItemsDiff(
  beforeItems: any[] = [],
  afterItems: any[] = [],
): Record<string, { from: any; to: any }> {
  const changes: Record<string, { from: any; to: any }> = {};
  const keyOf = (it: any) => (it.productId != null ? `p${it.productId}` : (it.product?.name ?? 'صنف'));
  const nameOf = (it: any) => it.product?.name ?? 'صنف';

  const beforeMap = new Map(beforeItems.map((it) => [keyOf(it), it]));
  const afterMap   = new Map(afterItems.map((it) => [keyOf(it), it]));

  for (const [key, b] of beforeMap) {
    const name = nameOf(b);
    const a = afterMap.get(key);
    if (!a) {
      changes[`صنف محذوف — ${name}`] = { from: `${b.qty} × ${b.price}`, to: null };
      continue;
    }
    if (a.price !== b.price) changes[`السعر — ${name}`] = { from: b.price, to: a.price };
    if (a.qty !== b.qty) changes[`الكمية — ${name}`] = { from: b.qty, to: a.qty };
  }
  for (const [key, a] of afterMap) {
    if (!beforeMap.has(key)) {
      changes[`صنف مضاف — ${nameOf(a)}`] = { from: null, to: `${a.qty} × ${a.price}` };
    }
  }
  return changes;
}

// Invoices/deals need item-level diffing on top of the generic scalar diff —
// handled separately from computeDiff() rather than folded into it.
function computeInvoiceLikeDiff(
  entity: 'invoices' | 'deals',
  before: Record<string, any>,
  after: Record<string, any>,
): Record<string, { from: any; to: any }> | undefined {
  const scalarKeys = entity === 'invoices' ? ['date', 'paid', 'note'] : ['date', 'note'];
  const scalarBefore: Record<string, any> = {};
  const scalarAfter: Record<string, any> = {};
  for (const k of scalarKeys) { scalarBefore[k] = before[k]; scalarAfter[k] = after[k]; }

  const changes: Record<string, { from: any; to: any }> = { ...(computeDiff(scalarBefore, scalarAfter) ?? {}) };

  if (entity === 'invoices') {
    const fromName = before.party?.name ?? null;
    const toName   = after.party?.name ?? null;
    if (fromName !== toName) changes['العميل/المورد'] = { from: fromName, to: toName };
    const fromWh = before.warehouse?.name ?? null;
    const toWh   = after.warehouse?.name ?? null;
    if (fromWh !== toWh) changes['المخزن'] = { from: fromWh, to: toWh };
  } else {
    const fromClient = before.client?.name ?? null;
    const toClient   = after.client?.name ?? null;
    if (fromClient !== toClient) changes['العميل'] = { from: fromClient, to: toClient };
    const fromSupplier = before.supplier?.name ?? null;
    const toSupplier   = after.supplier?.name ?? null;
    if (fromSupplier !== toSupplier) changes['المورد'] = { from: fromSupplier, to: toSupplier };
  }

  Object.assign(changes, computeItemsDiff(before.items, after.items));

  return Object.keys(changes).length ? changes : undefined;
}

// Human summary for a deleted transaction (or its whole group), built from the
// enriched DELETE_FETCH snapshot — falls back gracefully if a leg has no party/treasury.
function describeTxnDelete(snapshot: any): string | null {
  const rows: any[] = Array.isArray(snapshot) ? snapshot : [snapshot];
  const first = rows[0];
  if (!first) return null;
  const amt = first.debit || first.credit || first.cashIn || first.cashOut || first.cashIn2 || first.cashOut2 || 0;
  const who = first.party?.name ? ` — ${first.party.name}` : '';
  const where = first.treasury?.name ? ` (${first.treasury.name})` : '';
  return `${first.type} ${amt}${who}${where}`;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req    = ctx.switchToHttp().getRequest();
    const action = ACTION[req.method];

    if (!action || !req.user) return next.handle();

    const parts  = String(req.originalUrl || req.url || '').split('?')[0].split('/').filter(Boolean);
    const entity = parts[0] === 'api' ? parts[1] : parts[0];

    if (!entity || SKIP.has(entity)) return next.handle();

    // Money-movement CREATE/UPDATE gets a hand-built, entity-aware summary written
    // directly by TransactionsService (compound multi-leg actions, party/treasury
    // names) — only DELETE still goes through this generic path (see below).
    if (entity === 'transactions' && action !== 'DELETE') return next.handle();

    // Extract the entity uid from the URL path (works for PATCH / DELETE / resolve sub-routes)
    const uidIdx = parts[0] === 'api' ? 2 : 1;
    const pathUid = parts[uidIdx] && UID_RE.test(parts[uidIdx]) ? parts[uidIdx] : null;

    // For UPDATE, snapshot the entity before the handler mutates it
    let before: Record<string, any> | null = null;
    if (action === 'UPDATE') {
      const uid = pathUid;
      if (uid && BEFORE_FETCH[entity]) {
        before = await BEFORE_FETCH[entity](this.prisma, uid).catch(() => null);
      }
    }

    // For DELETE, capture the full entity snapshot before it's gone
    let snapshot: any = null;
    if (action === 'DELETE' && pathUid && DELETE_FETCH[entity]) {
      snapshot = await DELETE_FETCH[entity](this.prisma, pathUid).catch(() => null);
    }

    return next.handle().pipe(
      tap((body) => {
        if (!req.user) return;

        const isDeleteTxn = entity === 'transactions' && action === 'DELETE';
        const summary   = isDeleteTxn
          ? describeTxnDelete(snapshot)
          : (body?.no ?? body?.name ?? body?.clientName ?? body?.driverName ?? null);
        const entityUid = body?.uid ?? pathUid ?? null;
        const diff      = action === 'UPDATE' && before && body
          ? (entity === 'invoices' || entity === 'deals')
            ? computeInvoiceLikeDiff(entity, before, body)
            : computeDiff(before, body)
          : undefined;

        this.prisma.auditLog
          .create({
            data: {
              userName: req.user.name,
              action,
              entity,
              entityUid: entityUid ? String(entityUid) : null,
              summary: summary ? String(summary) : null,
              ...(diff ? { diff } : {}),
              ...(snapshot ? { snapshot } : {}),
            },
          })
          .catch(() => undefined);
      }),
    );
  }
}
