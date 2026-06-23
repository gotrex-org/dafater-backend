import {
  CallHandler, Controller, ExecutionContext, Get, Injectable, Module,
  NestInterceptor, Query,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/pagination';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Permissions } from '../../common/decorators/permissions.decorator';

const ACTION: Record<string, string> = { POST: 'CREATE', PATCH: 'UPDATE', PUT: 'UPDATE', DELETE: 'DELETE' };
// entities we don't want to record (auth flow + the audit reads themselves)
const SKIP = new Set(['auth', 'audit']);

/**
 * Global interceptor: writes one AuditLog row for every authenticated mutating
 * request (POST/PATCH/PUT/DELETE). Fire-and-forget so it never blocks responses.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const action = ACTION[req.method];

    return next.handle().pipe(
      tap((body) => {
        if (!action || !req.user) return; // skip GET and unauthenticated routes
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

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}
  findAll(q: PaginationQueryDto, user?: string) {
    return paginate(this.prisma.auditLog, q, {
      where: user ? { userName: user } : {},
      orderBy: { createdAt: 'desc' },
    });
  }
}

@Controller('audit')
@Permissions('settings') // admins (and settings managers) only
export class AuditController {
  constructor(private service: AuditService) {}
  @Get() findAll(@Query() q: PaginationQueryDto, @Query('user') user?: string) {
    return this.service.findAll(q, user);
  }
}

@Module({
  controllers: [AuditController],
  providers: [
    AuditService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AuditModule {}
