import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { PostEntryDto, ResolveDto, UpdateTransactionDto } from './dto/transactions.dto';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { syncPairedPartyLeg } from '../../common/transfer-sync';

@Controller('transactions')
@Permissions('entry', 'treasury', 'ledger')
export class TransactionsController {
  constructor(private service: TransactionsService, private prisma: PrismaService) {}

  @Get()
  list(@Query() q: PaginationQueryDto, @CurrentUser() user: any) {
    return this.service.list(q, user);
  }

  // فواتير الشراء التي فيها صنف بهذا الاسم — لتحميل الناولون الداخلي عليه.
  @Get('freight-lines')
  @Permissions('entry', 'treasury.settle')
  freightLines(@Query('search') search?: string) {
    return this.service.freightLines(search);
  }

  @Get('pending')
  pending() {
    return this.service.pendingList();
  }

  @Post()
  @Permissions('entry', 'treasury.settle')
  post(@Body() dto: PostEntryDto, @CurrentUser() user: any) {
    return this.service.post(dto, user);
  }

  @Patch(':id/resolve')
  @Permissions('entry')
  resolve(@Param('id') id: string, @Body() dto: ResolveDto, @CurrentUser() user: any) {
    return this.service.resolve(id, dto, user);
  }

  @Patch(':id')
  @Permissions('entry')
  async update(@Param('id') id: string, @Body() dto: UpdateTransactionDto, @CurrentUser() user: any) {
    const updated = await this.service.update(id, dto, user);
    // تحويل بين أطراف: التعديل من كشف أي طرف يسمع في كشف الطرف التاني
    await syncPairedPartyLeg(this.prisma, id);
    return updated;
  }

  @Delete(':id')
  @Permissions('entry')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user);
  }
}
