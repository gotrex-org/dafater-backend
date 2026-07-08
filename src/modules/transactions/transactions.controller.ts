import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { PostEntryDto, ResolveDto, UpdateTransactionDto } from './dto/transactions.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
@Permissions('entry', 'treasury', 'ledger')
export class TransactionsController {
  constructor(private service: TransactionsService) {}

  @Get()
  list(@Query() q: PaginationQueryDto, @CurrentUser() user: any) {
    return this.service.list(q, user);
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
  update(@Param('id') id: string, @Body() dto: UpdateTransactionDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @Permissions('entry')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
