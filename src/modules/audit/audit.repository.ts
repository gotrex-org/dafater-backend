import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';

@Injectable()
export class AuditRepository {
  constructor(private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto, user?: string) {
    return paginate(this.prisma.auditLog, q, {
      where: user ? { userName: user } : {},
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
