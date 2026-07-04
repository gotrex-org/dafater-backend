import { Injectable } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateDriverDto, UpdateDriverDto } from './dto/drivers.dto';
import { DriversRepository } from './drivers.repository';

@Injectable()
export class DriversService {
  constructor(private repo: DriversRepository) {}

  findAll(q: PaginationQueryDto) { return this.repo.findAll(q); }
  findOne(id: string) { return this.repo.findOne(id); }
  create(dto: CreateDriverDto) { return this.repo.create(dto); }
  upsertByName(name: string, data?: { nationalId?: string; phone?: string; vehicleNo?: string; trailerNo?: string }) { return this.repo.upsertByName(name, data); }
  update(id: string, dto: UpdateDriverDto) { return this.repo.update(id, dto); }
  remove(id: string) { return this.repo.remove(id); }
}
