import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateReminderDto, UpdateReminderDto } from './dto/reminders.dto';
import { RemindersService } from './reminders.service';

// No @Permissions — every authenticated user manages ONLY their own reminders (scoped by
// ownerId). The UI surfaces the section to the owner account.
@Controller('reminders')
export class RemindersController {
  constructor(private service: RemindersService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user.intId);
  }

  @Get('due-count')
  dueCount(@CurrentUser() user: any) {
    return this.service.dueCount(user.intId);
  }

  @Post()
  create(@Body() dto: CreateReminderDto, @CurrentUser() user: any) {
    return this.service.create(user.intId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateReminderDto, @CurrentUser() user: any) {
    return this.service.update(id, user.intId, dto);
  }

  @Post(':id/done')
  markDone(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.markDone(id, user.intId);
  }

  @Post(':id/undo')
  undo(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.undo(id, user.intId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user.intId);
  }
}
