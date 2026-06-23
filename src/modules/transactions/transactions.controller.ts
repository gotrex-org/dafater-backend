import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { PostEntryDto, ResolveDto } from './dto/transactions.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
@Permissions('entry', 'treasury', 'ledger')
export class TransactionsController {
  constructor(private service: TransactionsService) {}

  @Get()
  list(@Query() q: PaginationQueryDto, @Query('date') date?: string) {
    return this.service.list(q, date);
  }

  @Get('pending')
  pending() {
    return this.service.pendingList();
  }

  @Post()
  @Permissions('entry')
  post(@Body() dto: PostEntryDto) {
    return this.service.post(dto);
  }

  @Patch(':id/resolve')
  @Permissions('entry')
  resolve(@Param('id') id: string, @Body() dto: ResolveDto) {
    return this.service.resolve(id, dto);
  }

  @Delete(':id')
  @Permissions('entry')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
