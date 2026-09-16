import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AddClearanceExpenseDto, ClearanceQueryDto, PayClearanceAgentDto } from './dto/clearance.dto';
import { ClearanceService } from './clearance.service';

@Controller('clearance')
export class ClearanceController {
  constructor(private service: ClearanceService) {}

  @Get('agents')
  @Permissions('clearance')
  agents() {
    return this.service.agents();
  }

  @Get()
  @Permissions('clearance')
  list(@Query() q: ClearanceQueryDto) {
    return this.service.list(q);
  }

  @Post('expense')
  @Permissions('clearance.expense')
  addExpense(@Body() dto: AddClearanceExpenseDto, @CurrentUser() user: any) {
    return this.service.addExpense(dto, user?.intId);
  }

  @Post('pay')
  @Permissions('clearance.pay')
  pay(@Body() dto: PayClearanceAgentDto, @CurrentUser() user: any) {
    return this.service.pay(dto, user?.intId);
  }

  @Delete(':id')
  @Permissions('clearance.delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
