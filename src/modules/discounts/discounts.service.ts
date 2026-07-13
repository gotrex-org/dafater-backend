import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDiscountDto, CreateDiscountScheduleDto } from './dto/discounts.dto';
import { DiscountsRepository } from './discounts.repository';

@Injectable()
export class DiscountsService {
  constructor(private repo: DiscountsRepository, private prisma: PrismaService) {}

  // Applying due recurring discounts lazily on read keeps them up to date without a cron.
  async findAll(q: PaginationQueryDto) {
    await this.repo.processDue().catch(() => undefined);
    return this.repo.findAll(q);
  }

  create(dto: CreateDiscountDto, createdById?: number) { return this.repo.create(dto, createdById); }

  listSchedules() { return this.repo.listSchedules(); }
  async createSchedule(dto: CreateDiscountScheduleDto) {
    const s = await this.repo.createSchedule(dto);
    await this.repo.processDue().catch(() => undefined); // apply immediately if already due
    return s;
  }
  removeSchedule(uid: string) { return this.repo.removeSchedule(uid); }

  async remove(id: string, cascade: boolean) {
    const d = await this.repo.findByUid(id);
    if (!d) throw new NotFoundException('Discount not found');
    if (!cascade) {
      const related = await this.prisma.transaction.count({ where: { discountId: d.id } });
      if (related > 0) {
        throw new ConflictException(`يوجد ${related} حركة مرتبطة بهذا الخصم — أكّد حذفها معه`);
      }
    }
    return this.repo.remove(id);
  }
}
