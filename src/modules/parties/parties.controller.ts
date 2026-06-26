import {
  Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req,
} from '@nestjs/common';
import { Request } from 'express';
import { PartyRole } from '@prisma/client';
import { PartiesService } from './parties.service';
import { CreatePartyDto, UpdatePartyDto } from './dto/party.dto';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AdminOnly } from '../../common/decorators/admin.decorator';
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

  // Accessible to any authenticated user — customer sees their own party's ledger
  @Get('my/ledger')
  @Permissions()
  myLedger(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string) {
    const partyId = (req as any).user?.partyId;
    if (!partyId) throw new ForbiddenException('No party linked to this account');
    return this.service.ledger(partyId, from, to);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/ledger')
  ledger(@Param('id') id: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.ledger(id, from, to);
  }

  @Post()
  @Permissions('settings', 'invoices')
  create(@Body() dto: CreatePartyDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Permissions('settings', 'invoices')
  update(@Param('id') id: string, @Body() dto: UpdatePartyDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @AdminOnly() // حذف الأطراف للمدير فقط
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
