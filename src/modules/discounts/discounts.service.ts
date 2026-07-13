import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDiscountDto } from './dto/discounts.dto';
import { DiscountsRepository } from './discounts.repository';

@Injectable()
export class DiscountsService {
  constructor(private repo: DiscountsRepository, private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto) { return this.repo.findAll(q); }

  create(dto: CreateDiscountDto, createdById?: number) { return this.repo.create(dto, createdById); }

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
