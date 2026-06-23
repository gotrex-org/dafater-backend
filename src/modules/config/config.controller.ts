import { Body, Controller, Get, Put } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { AdminOnly } from '../../common/decorators/admin.decorator';
import { UpdateConfigDto } from './dto/config.dto';
import { AppConfigService } from './config.service';

@Controller('config')
export class AppConfigController {
  constructor(private service: AppConfigService) {}

  @Public()
  @Get()
  get() {
    return this.service.get();
  }

  @AdminOnly()
  @Put()
  update(@Body() dto: UpdateConfigDto) {
    return this.service.update(dto);
  }
}
