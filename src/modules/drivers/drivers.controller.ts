import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { DriversService } from './drivers.service';
import { CreateDriverDto, UpdateDriverDto } from './dto/drivers.dto';

@Controller('drivers')
@Permissions('settings', 'manifests', 'driver-trips')
export class DriversController {
  constructor(private service: DriversService) {}

  @Get()
  findAll(@Query() q: PaginationQueryDto) { return this.service.findAll(q); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post()
  @Permissions('settings')
  create(@Body() dto: CreateDriverDto) { return this.service.create(dto); }

  @Patch(':id')
  @Permissions('settings')
  update(@Param('id') id: string, @Body() dto: UpdateDriverDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @Permissions('settings')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
