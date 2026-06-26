import { Injectable } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateAdjustmentDto } from './dto/adjustments.dto';
import { AdjustmentsRepository } from './adjustments.repository';

@Injectable()
export class AdjustmentsService {
  constructor(private repo: AdjustmentsRepository) {}

  findAll(q: PaginationQueryDto, warehouseId?: string) {
    return this.repo.findAll(q, warehouseId);
  }

  create(dto: CreateAdjustmentDto) {
    return this.repo.create(dto);
  }

  remove(id: string) {
    return this.repo.remove(id);
  }
}
