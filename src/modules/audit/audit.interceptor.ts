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
  invoices:      (p, uid) => p.invoice.findUnique({ where: { uid }, select: { date: true, paid: true, note: true } }),
  parties:       (p, uid) => p.party.findUnique({ where: { uid }, select: { name: true, phone: true } }),
  manifests:     (p, uid) => p.manifest.findUnique({ where: { uid }, select: { clientName: true, driverName: true, vehicleNo: true, trailerNo: true, note: true } }),
  deals:         (p, uid) => p.deal.findUnique({ where: { uid }, select: { date: true, note: true } }),
  products:      (p, uid) => p.product.findUnique({ where: { uid }, select: { name: true, unit: true } }),
  'driver-trips':(p, uid) => p.driverTrip.findUnique({ where: { uid }, select: { driverName: true, agreedFreight: true, note: true } }),
  requests:      (p, uid) => p.request.findUnique({ where: { uid }, select: { done: true, note: true } }),
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

    // For UPDATE, snapshot the entity before the handler mutates it
    let before: Record<string, any> | null = null;
    if (action === 'UPDATE') {
      const uid = parts[2] && UID_RE.test(parts[2]) ? parts[2] : null;
      if (uid && BEFORE_FETCH[entity]) {
        before = await BEFORE_FETCH[entity](this.prisma, uid).catch(() => null);
      }
    }

    return next.handle().pipe(
      tap((body) => {
        if (!req.user) return;
        const summary = body?.no ?? body?.name ?? body?.clientName ?? null;
        const diff    = action === 'UPDATE' && before && body
          ? computeDiff(before, body)
          : undefined;

        this.prisma.auditLog
          .create({
            data: {
              userName: req.user.name,
              action,
              entity,
              summary: summary ? String(summary) : null,
              ...(diff ? { diff } : {}),
            },
          })
          .catch(() => undefined);
      }),
    );
  }
}
