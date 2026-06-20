import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { PartyRole } from '@prisma/client';
import { PartiesService } from './parties.service';
import { CreatePartyDto, UpdatePartyDto } from './dto/party.dto';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

@Controller('parties')
@Permissions('ledger', 'settings', 'invoices', 'entry')
export class PartiesController {
  constructor(private service: PartiesService) {}

  @Get()
  findAll(
    @Query() q: PaginationQueryDto,
    @Query('role') role?: PartyRole,
    @Query('includeHidden') includeHidden?: string,
  ) {
    return this.service.findAll(q, role, includeHidden === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/ledger')
  ledger(@Param('id') id: string) {
    return this.service.ledger(id);
  }

  @Post()
  @Permissions('settings')
  create(@Body() dto: CreatePartyDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Permissions('settings')
  update(@Param('id') id: string, @Body() dto: UpdatePartyDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions('settings')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
