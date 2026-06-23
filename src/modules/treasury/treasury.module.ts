import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
  Injectable, Module,
} from '@nestjs/common';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Currency } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BalancesService } from '../balances/balances.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';

export class TreasuryDto {
  @IsString() name: string;
  @IsOptional() @IsEnum(Currency) currency?: Currency;
  @IsOptional() @IsNumber() opening?: number;
}

@Injectable()
export class TreasuryService {
  constructor(
    private prisma: PrismaService,
    private balances: BalancesService,
  ) {}

  async findAll(q: PaginationQueryDto) {
    const result = await paginate(this.prisma.treasuryAccount, q, { orderBy: { createdAt: 'asc' } });
    result.data = await Promise.all(
      result.data.map(async (a: any) => ({ ...a, balance: await this.balances.treasuryBalance(a.id) })),
    );
    return result;
  }

  /** all cash movements across accounts */
  movements(q: PaginationQueryDto) {
    return paginate(this.prisma.transaction, q, {
      where: {
        OR: [
          { cashIn: { gt: 0 } }, { cashOut: { gt: 0 } },
          { cashIn2: { gt: 0 } }, { cashOut2: { gt: 0 } },
        ],
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { treasury: true, treasury2: true, party: true, category: true },
    });
  }

  /** expenses grouped by category */
  async expensesByCategory() {
    const grouped = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { OR: [{ type: 'مصروف' }, { type: 'عمولة' }] },
      _sum: { cashOut: true, expAmt: true },
    });
    const cats = await this.prisma.expenseCategory.findMany();
    // transaction.categoryId is the category's integer id; expose its uid
    const byId = new Map(cats.map((c) => [c.id, c]));
    return grouped.map((g) => {
      const cat = g.categoryId == null ? undefined : byId.get(g.categoryId);
      return {
        categoryId: cat?.uid ?? null,
        category: cat?.name ?? 'غير محدد',
        total: (g._sum.cashOut || 0) + (g._sum.expAmt || 0),
      };
    });
  }

  create(dto: TreasuryDto) {
    return this.prisma.treasuryAccount.create({ data: dto });
  }
  update(id: string, dto: TreasuryDto) {
    return this.prisma.treasuryAccount.update({ where: { uid: id }, data: dto });
  }
  remove(id: string) {
    return this.prisma.treasuryAccount.delete({ where: { uid: id } });
  }
}

@Controller('treasury')
@Permissions('treasury', 'entry', 'invoices', 'settings')
export class TreasuryController {
  constructor(private service: TreasuryService) {}
  @Get() findAll(@Query() q: PaginationQueryDto) {
    return this.service.findAll(q);
  }
  @Get('movements') @Permissions('treasury') movements(@Query() q: PaginationQueryDto) {
    return this.service.movements(q);
  }
  @Get('expenses-by-category') @Permissions('treasury') expenses() {
    return this.service.expensesByCategory();
  }
  @Post() @Permissions('settings', 'treasury.add') create(@Body() dto: TreasuryDto) {
    return this.service.create(dto);
  }
  @Patch(':id') @Permissions('settings') update(@Param('id') id: string, @Body() dto: TreasuryDto) {
    return this.service.update(id, dto);
  }
  @Delete(':id') @Permissions('settings') remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({ providers: [TreasuryService], controllers: [TreasuryController] })
export class TreasuryModule {}
