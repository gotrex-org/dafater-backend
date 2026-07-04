import { Injectable } from '@nestjs/common';
import { BalancesService } from '../balances/balances.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { TreasuryDto } from './dto/treasury.dto';
import { TreasuryRepository } from './treasury.repository';

@Injectable()
export class TreasuryService {
  constructor(
    private repo: TreasuryRepository,
    private balances: BalancesService,
  ) {}

  async findAll(q: PaginationQueryDto) {
    const result = await this.repo.findAll(q);
    result.data = await Promise.all(
      result.data.map(async (a: any) => ({ ...a, balance: await this.balances.treasuryBalance(a.id) })),
    );
    return result;
  }

  movements(q: PaginationQueryDto) { return this.repo.movements(q); }
  expensesByCategory() { return this.repo.expensesByCategory(); }
  create(dto: TreasuryDto) { return this.repo.create(dto); }
  update(id: string, dto: TreasuryDto) { return this.repo.update(id, dto); }
  remove(id: string) { return this.repo.remove(id); }
}
