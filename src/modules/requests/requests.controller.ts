import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateRequestDto, ReceiveDto } from './dto/requests.dto';
import { RequestsService } from './requests.service';

@Controller('requests')
@Permissions('requests')
export class RequestsController {
  constructor(private service: RequestsService) {}
  @Get() findAll(@Query() q: PaginationQueryDto, @Query('done') done?: string, @Query('clientId') clientId?: string) {
    return this.service.findAll(q, done === 'true', clientId);
  }
  @Post() create(@Body() dto: CreateRequestDto) {
    return this.service.create(dto);
  }
  @Patch(':id/done') markDone(@Param('id') id: string) {
    return this.service.markDone(id);
  }
  @Patch(':id/receive') receive(@Param('id') id: string, @Body() dto: ReceiveDto) {
    return this.service.receive(id, dto);
  }
  @Delete(':id') @Permissions('requests.delete') remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
