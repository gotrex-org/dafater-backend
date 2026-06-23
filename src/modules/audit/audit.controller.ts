import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

@Controller('audit')
@Permissions('settings')
export class AuditController {
  constructor(private service: AuditService) {}

  @Get()
  findAll(@Query() q: PaginationQueryDto, @Query('user') user?: string) {
    return this.service.findAll(q, user);
  }
}
