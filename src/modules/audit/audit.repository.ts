import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';

@Injectable()
export class AuditRepository {
  constructor(private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto, user?: string) {
    const where: any = {};
    if (user) where.userName = user;
    if (q.search) where.OR = [
      { summary: { contains: q.search, mode: 'insensitive' } },
      { userName: { contains: q.search, mode: 'insensitive' } },
    ];
    if (q.from || q.to) where.createdAt = {
      gte: q.from ? new Date(q.from) : undefined,
      lt: q.to ? new Date(new Date(q.to).getTime() + 86400000) : undefined,
    };
    return paginate(this.prisma.auditLog, q, {
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  findTrash(q: PaginationQueryDto) {
    return paginate(this.prisma.auditLog, q, {
      where: { action: 'DELETE', NOT: { snapshot: null } },
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
