import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { InvoiceKind } from '@prisma/client';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateInvoiceDto } from './dto/invoices.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
@Permissions('invoices')
export class InvoicesController {
  constructor(private service: InvoicesService) {}

  @Get()
  findAll(@Query() q: PaginationQueryDto, @Query('kind') kind?: InvoiceKind) {
    return this.service.findAll(q, kind);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateInvoiceDto) {
    return this.service.create(dto);
  }

  @Delete(':id')
  @Permissions('invoices.delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
