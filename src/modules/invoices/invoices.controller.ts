import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { InvoiceKind } from '@prisma/client';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateInvoiceDto, UpdateInvoiceDto, CommissionDto } from './dto/invoices.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
@Permissions('invoices')
export class InvoicesController {
  constructor(private service: InvoicesService) {}

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
  create(@Body() dto: CreateInvoiceDto) {
    return this.service.create(dto);
  }

  @Patch(':id/commission')
  @Permissions('invoices.commission')
  updateCommission(@Param('id') id: string, @Body() dto: CommissionDto) {
    return this.service.updateCommission(id, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions('invoices.delete')
  remove(@Param('id') id: string, @Query('cascade') cascade?: string) {
    return this.service.remove(id, cascade === 'true');
  }
}
