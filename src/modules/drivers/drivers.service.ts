import { Injectable } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateDriverDto, CreateDriverAdvanceDto, UpdateDriverDto } from './dto/drivers.dto';
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

  createAdvance(dto: CreateDriverAdvanceDto) { return this.repo.createAdvance(dto); }
  listAdvances(driverName: string) { return this.repo.listAdvances(driverName); }
  deleteAdvance(uid: string) { return this.repo.deleteAdvance(uid); }
}
