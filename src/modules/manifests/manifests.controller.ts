import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateManifestDto, UpdateManifestDto } from './dto/manifests.dto';
import { ManifestsService } from './manifests.service';

@Controller('manifests')
@Permissions('manifests')
export class ManifestsController {
  constructor(private service: ManifestsService) {}

  @Get('my')
  @Permissions()
  myManifests(@Req() req: Request) {
    const partyId = (req as any).user?.partyId;
    if (!partyId) throw new ForbiddenException('No party linked to this account');
    return this.service.findForParty(partyId);
  }

  @Get()
  findAll(@Query() q: PaginationQueryDto) {
    return this.service.findAll(q);
  }

  @Get('next-no')
  nextNo(@Query('clientName') clientName: string) {
    return this.service.peekNextNo(clientName);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateManifestDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Permissions('manifests.create')
  update(@Param('id') id: string, @Body() dto: UpdateManifestDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions('manifests.delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
