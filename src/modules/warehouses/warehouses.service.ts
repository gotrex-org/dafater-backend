import { Injectable } from '@nestjs/common';
import { BalancesService } from '../balances/balances.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { WarehouseDto } from './dto/warehouses.dto';
import { WarehousesRepository } from './warehouses.repository';

@Injectable()
export class WarehousesService {
  constructor(
    private repo: WarehousesRepository,
    private balances: BalancesService,
  ) {}

  findAll(q: PaginationQueryDto) { return this.repo.findAll(q); }

  async stock(id: string) {
    const wh = await this.repo.findByUid(id);
    if (!wh) return [];
    return this.balances.warehouseStock(wh.id);
  }

  create(dto: WarehouseDto) { return this.repo.create(dto); }
  update(id: string, dto: WarehouseDto) { return this.repo.update(id, dto); }
  remove(id: string) { return this.repo.remove(id); }
}
