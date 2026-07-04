import { Controller, Get } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@Permissions('dash')
export class DashboardController {
  constructor(private service: DashboardService) {}

  @Get()
  stats() {
    return this.service.stats();
  }
}
