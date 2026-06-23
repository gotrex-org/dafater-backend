import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/pagination';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

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
