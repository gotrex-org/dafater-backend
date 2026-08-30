import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { localDayRange } from '../../common/local-day';

@Injectable()
export class AuditRepository {
  constructor(private prisma: PrismaService) {}

  // The toolbar filters (بحث / من / إلى) all narrow the same list, so both the log and
  // the trash view build their `where` here. `createdAt` is a real timestamp, not a
  // date-only column, so the day bounds are resolved in the users' timezone.
  private buildWhere(q: PaginationQueryDto, base: any = {}) {
    const where: any = { ...base };
    if (q.search) {
      where.OR = [
        { summary: { contains: q.search, mode: 'insensitive' } },
        { userName: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    const createdAt = localDayRange(q.from, q.to);
    if (createdAt) where.createdAt = createdAt;
    return where;
  }

  findAll(q: PaginationQueryDto, user?: string) {
    return paginate(this.prisma.auditLog, q, {
      where: this.buildWhere(q, user ? { userName: user } : {}),
      orderBy: { createdAt: 'desc' },
    });
  }

  findTrash(q: PaginationQueryDto) {
    return paginate(this.prisma.auditLog, q, {
      // Prisma rejects a bare `null` on a Json column — SQL NULL is spelled `DbNull`.
      where: this.buildWhere(q, { action: 'DELETE', snapshot: { not: Prisma.DbNull } }),
      orderBy: { createdAt: 'desc' },
    });
  }

  findOneByUid(uid: string) {
    return this.prisma.auditLog.findUniqueOrThrow({ where: { uid } });
  }

  deleteByUid(uid: string) {
    return this.prisma.auditLog.delete({ where: { uid } });
  }
}
