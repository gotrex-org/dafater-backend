import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

const ACTION: Record<string, string> = { POST: 'CREATE', PATCH: 'UPDATE', PUT: 'UPDATE', DELETE: 'DELETE' };
const SKIP = new Set(['auth', 'audit']);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const action = ACTION[req.method];

    return next.handle().pipe(
      tap((body) => {
        if (!action || !req.user) return;
        const parts = String(req.originalUrl || req.url || '').split('?')[0].split('/').filter(Boolean);
        const entity = parts[0] === 'api' ? parts[1] : parts[0];
        if (!entity || SKIP.has(entity)) return;
        const summary = body?.no ?? body?.name ?? body?.clientName ?? null;
        this.prisma.auditLog
          .create({ data: { userName: req.user.name, action, entity, summary: summary ? String(summary) : null } })
          .catch(() => undefined);
      }),
    );
  }
}
