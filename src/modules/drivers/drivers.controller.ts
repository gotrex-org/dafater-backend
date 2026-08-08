import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { DriversService } from './drivers.service';
import { CreateDriverDto, CreateDriverAdvanceDto, UpdateDriverDto } from './dto/drivers.dto';

@Controller('drivers')
@Permissions('settings', 'manifests', 'driver-trips')
export class DriversController {
  constructor(private service: DriversService) {}

  @Get()
  findAll(@Query() q: PaginationQueryDto) { return this.service.findAll(q); }

  // ── سلف السائق ── (قبل ':id' عشان ماتتفهمش advances كـ id)
  @Post('advances')
  createAdvance(@Body() dto: CreateDriverAdvanceDto) { return this.service.createAdvance(dto); }

  @Get('advances/:name')
  listAdvances(@Param('name') name: string) { return this.service.listAdvances(name); }

  @Delete('advances/:uid')
  deleteAdvance(@Param('uid') uid: string) { return this.service.deleteAdvance(uid); }

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
