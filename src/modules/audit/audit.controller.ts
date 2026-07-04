import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AdminOnly } from '../../common/decorators/admin.decorator';
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

  @Get('trash')
  @AdminOnly()
  findTrash(@Query() q: PaginationQueryDto) {
    return this.service.findTrash(q);
  }

  @Post(':id/undo')
  @AdminOnly()
  undo(@Param('id') id: string) {
    return this.service.undo(id);
  }
}
