import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { ChargeTypeDto, UpdateChargeTypeDto } from './dto/charge-types.dto';
import { ChargeTypesService } from './charge-types.service';

@Controller('charge-types')
@Permissions('invoices', 'settings', 'manifests')
export class ChargeTypesController {
  constructor(private service: ChargeTypesService) {}

  @Get()
  findAll(@Query('all') all?: string) {
    return this.service.findAll(all === '1' || all === 'true');
  }

  @Post()
  @Permissions('settings')
  create(@Body() dto: ChargeTypeDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Permissions('settings')
  update(@Param('id') id: string, @Body() dto: UpdateChargeTypeDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions('settings')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
