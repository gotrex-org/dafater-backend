import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * The database uses an integer `id` primary key plus a stable `uid` (cuid).
 * Foreign keys are integers referencing the parent's `id`, but the public API
 * speaks only `uid`. This interceptor maps every outgoing response so the
 * integer ids never leave the API:
 *
 *  - any object carrying a string `uid` has its `id` overwritten with that
 *    `uid`, and the raw `uid` dropped;
 *  - any integer foreign-key scalar (e.g. `partyId`) is replaced with the
 *    related row's `uid` when that relation is included in the response, and
 *    otherwise dropped (so an integer id can never leak).
 *
 * Pagination meta, tokens, money fields, and other plain values pass through
 * untouched.
 */

// foreign-key scalar field  ->  the relation field that holds the related row
const FK_RELATIONS: Record<string, string> = {
  partyId: 'party',
  treasuryId: 'treasury',
  treasuryId2: 'treasury2',
  categoryId: 'category',
  invoiceId: 'invoice',
  dealId: 'deal',
  warehouseId: 'warehouse',
  productId: 'product',
  clientId: 'client',
  supplierId: 'supplier',
  manifestId: 'manifest',
  requestId: 'request',
  orderId: 'order',
};

@Injectable()
export class UidSerializerInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => present(data)));
  }
}

function present(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(present);

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = present(v);
    }

    // expose `uid` as the public `id`
    if (typeof out.uid === 'string') {
      out.id = out.uid;
      delete out.uid;
    }

    // never leak integer foreign keys: swap for the related uid, else drop
    for (const [fk, relation] of Object.entries(FK_RELATIONS)) {
      if (typeof out[fk] !== 'number') continue;
      const related = out[relation] as Record<string, unknown> | null | undefined;
      out[fk] = related && typeof related.id === 'string' ? related.id : undefined;
      if (out[fk] === undefined) delete out[fk];
    }

    return out;
  }

  return value;
}
