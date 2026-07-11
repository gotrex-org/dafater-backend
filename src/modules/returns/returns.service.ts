import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceKind } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReturnDto } from './dto/returns.dto';
import { ReturnsRepository } from './returns.repository';

@Injectable()
export class ReturnsService {
  constructor(private repo: ReturnsRepository, private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto, kind?: InvoiceKind) { return this.repo.findAll(q, kind); }

  async findOne(id: string) {
    const ret = await this.repo.findOne(id);
    if (!ret) throw new NotFoundException('Return not found');
    return ret;
  }

  create(dto: CreateReturnDto, createdById?: number) { return this.repo.create(dto, createdById); }

  peekNextNo(partyUid: string) { return this.repo.peekNextNo(partyUid); }

  async remove(id: string, cascade: boolean) {
    const ret = await this.repo.findByUid(id);
    if (!ret) throw new NotFoundException('Return not found');
    if (!cascade) {
      const related = await this.prisma.transaction.count({ where: { returnId: ret.id } });
      if (related > 0) {
        throw new ConflictException(`يوجد ${related} حركة مالية مرتبطة بهذا المرتجع — أكّد حذفها معه لحذف المرتجع`);
      }
    }
    return this.repo.remove(id);
  }
}
