import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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

  async findAll(q: PaginationQueryDto, user?: any) {
    const restricted = !user?.admin && user?.treasuryIds?.length ? user.treasuryIds : undefined;
    const result = await this.repo.findAll(q, restricted);
    result.data = await Promise.all(
      result.data.map(async (a: any) => ({ ...a, balance: await this.balances.treasuryBalance(a.id) })),
    );
    return result;
  }

  movements(q: PaginationQueryDto, user?: any) {
    const restricted = !user?.admin && user?.treasuryIds?.length ? user.treasuryIds : undefined;
    return this.repo.movements(q, restricted);
  }
  expensesByCategory() { return this.repo.expensesByCategory(); }
  create(dto: TreasuryDto) { return this.repo.create(dto); }
  update(id: string, dto: TreasuryDto) { return this.repo.update(id, dto); }

  async remove(id: string, cascade: boolean) {
    const acc = await this.repo.findByUid(id);
    if (!acc) throw new NotFoundException('الخزينة غير موجودة');
    if (!cascade) {
      const related = await this.repo.countRelatedTransactions(acc.id);
      if (related > 0) {
        throw new ConflictException(`يوجد ${related} حركة نقدية مرتبطة بهذه الخزينة — احذفها أولاً أو أكّد حذفها معها`);
      }
    }
    return this.repo.removeCascade(acc.id);
  }
}
