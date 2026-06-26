import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateConfigDto } from './dto/config.dto';

@Injectable()
export class AppConfigRepository {
  constructor(private prisma: PrismaService) {}

  get() {
    return this.prisma.config.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  }

  update(dto: UpdateConfigDto) {
    return this.prisma.config.upsert({
      where: { id: 1 },
      update: { orderEmail: dto.orderEmail },
      create: { id: 1, orderEmail: dto.orderEmail },
    });
  }
}
