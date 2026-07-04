import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { CreateDriverDto, UpdateDriverDto } from './dto/drivers.dto';

@Injectable()
export class DriversRepository {
  constructor(private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto) {
    return paginate(this.prisma.driver, q, {
      where: q.search ? { name: { contains: q.search, mode: 'insensitive' as const } } : {},
      orderBy: { name: 'asc' },
    });
  }

  findOne(uid: string) {
    return this.prisma.driver.findUniqueOrThrow({ where: { uid } });
  }

  create(dto: CreateDriverDto) {
    return this.prisma.driver.create({ data: dto });
  }

  upsertByName(name: string, data?: { nationalId?: string; phone?: string; vehicleNo?: string; trailerNo?: string }) {
    const extra = data ? Object.fromEntries(Object.entries(data).filter(([, v]) => !!v)) : {};
    return this.prisma.driver.upsert({
      where: { name },
      create: { name, ...extra },
      update: extra,
    });
  }

  update(uid: string, dto: UpdateDriverDto) {
    return this.prisma.driver.update({ where: { uid }, data: dto });
  }

  remove(uid: string) {
    return this.prisma.driver.delete({ where: { uid } });
  }
}
