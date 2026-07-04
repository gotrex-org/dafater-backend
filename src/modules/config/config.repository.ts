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
    const data: any = {};
    if (dto.orderEmail     !== undefined) data.orderEmail     = dto.orderEmail;
    if (dto.delayGraceDays !== undefined) data.delayGraceDays = dto.delayGraceDays;
    if (dto.delayFeePerDay !== undefined) data.delayFeePerDay = dto.delayFeePerDay;
    return this.prisma.config.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data },
    });
  }
}
