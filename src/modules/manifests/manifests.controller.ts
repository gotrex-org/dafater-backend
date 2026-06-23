import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateManifestDto } from './dto/manifests.dto';
import { ManifestsService } from './manifests.service';

@Controller('manifests')
@Permissions('manifests')
export class ManifestsController {
  constructor(private service: ManifestsService) {}

  @Get()
  findAll(@Query() q: PaginationQueryDto) {
    return this.service.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateManifestDto) {
    return this.service.create(dto);
  }

  @Delete(':id')
  @Permissions('manifests.delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
