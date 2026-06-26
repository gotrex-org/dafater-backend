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
}
