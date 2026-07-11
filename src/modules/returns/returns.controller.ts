import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { InvoiceKind } from '@prisma/client';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateReturnDto } from './dto/returns.dto';
import { ReturnsService } from './returns.service';

// Returns live under the invoices permission — they're a section within الفواتير.
@Controller('returns')
@Permissions('invoices')
export class ReturnsController {
  constructor(private service: ReturnsService) {}

  @Get()
  findAll(@Query() q: PaginationQueryDto, @Query('kind') kind?: InvoiceKind) {
    return this.service.findAll(q, kind);
  }

  @Get('next-no')
  nextNo(@Query('partyId') partyId: string) {
    return this.service.peekNextNo(partyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateReturnDto, @CurrentUser() user: any) {
    return this.service.create(dto, user?.intId);
  }

  @Delete(':id')
  @Permissions('invoices.delete')
  remove(@Param('id') id: string, @Query('cascade') cascade?: string) {
    return this.service.remove(id, cascade === 'true');
  }
}
