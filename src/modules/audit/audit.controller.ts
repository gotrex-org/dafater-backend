import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AdminOnly } from '../../common/decorators/admin.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('audit')
@Permissions('audit', 'settings')
export class AuditController {
  constructor(private service: AuditService) {}

  @Get()
  findAll(
    @Query() q: PaginationQueryDto,
    @Query('user') user?: string,
    @Query('action') action?: string,
    @Query('review') review?: string,
  ) {
    return this.service.findAll(q, user, action, review);
  }

  @Post(':id/approve')
  @AdminOnly()
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.review(id, 'APPROVED', user.name);
  }

  @Post(':id/reject')
  @AdminOnly()
  reject(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.review(id, 'REJECTED', user.name);
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
