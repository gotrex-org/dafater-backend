import { Injectable } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateDealDto, DealCommissionDto } from './dto/deals.dto';
import { DealsRepository } from './deals.repository';

@Injectable()
export class DealsService {
  constructor(private repo: DealsRepository) {}

  findAll(q: PaginationQueryDto) { return this.repo.findAll(q); }
  findOne(uid: string) { return this.repo.findOne(uid); }
  create(dto: CreateDealDto, createdById?: number) { return this.repo.create(dto, createdById); }
  update(uid: string, dto: CreateDealDto, createdById?: number) { return this.repo.update(uid, dto, createdById); }
  updateCommission(uid: string, dto: DealCommissionDto) { return this.repo.updateCommission(uid, dto); }
  remove(id: string) { return this.repo.remove(id); }
  peekNextNo(clientUid: string) { return this.repo.peekNextNo(clientUid); }
}
