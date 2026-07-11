import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';

const PARTY_SELECT = { select: { uid: true, name: true } } as const;

@Injectable()
export class UsersRepository {
  constructor(private prisma: PrismaService) {}

  async findAll(q: PaginationQueryDto) {
    return paginate(this.prisma.user, q, {
      include: { party: PARTY_SELECT },
      orderBy: { createdAt: 'asc' },
    });
  }

  findPartyByUid(uid: string) {
    return this.prisma.party.findUniqueOrThrow({ where: { uid } });
  }

  findByUid(uid: string) {
    return this.prisma.user.findUnique({ where: { uid }, select: { id: true, uid: true, isPrimary: true } });
  }

  create(data: any) {
    return this.prisma.user.create({ data, include: { party: PARTY_SELECT } });
  }

  update(id: string, data: any) {
    return this.prisma.user.update({ where: { uid: id }, data, include: { party: PARTY_SELECT } });
  }

  count() {
    return this.prisma.user.count();
  }

  remove(id: string) {
    return this.prisma.user.delete({ where: { uid: id } });
  }
}
