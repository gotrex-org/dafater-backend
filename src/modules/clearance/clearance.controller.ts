import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  AddCashClearanceDto, AddClearanceExpenseDto, ArchiveClearanceAgentDto, ClearanceAgentDto,
  ClearanceAgentsQueryDto, ClearanceQueryDto, PayClearanceAgentDto, UpdateClearanceAgentDto,
  UpdateClearanceMovementDto,
} from './dto/clearance.dto';
import { ClearanceService } from './clearance.service';

@Controller('clearance')
export class ClearanceController {
  constructor(private service: ClearanceService) {}

  // ── المكاتب ──

  // قائمة المكاتب بتتعرض كمان في كشف العربية (اختيار مكتب الجمرك والتخليص).
  @Get('agents')
  @Permissions('clearance', 'manifests')
  agents(@Query() q: ClearanceAgentsQueryDto) {
    return this.service.agents(q.archived === '1');
  }

  @Post('agents')
  @Permissions('clearance.offices')
  createAgent(@Body() dto: ClearanceAgentDto) {
    return this.service.createAgent(dto);
  }

  @Patch('agents/:id')
  @Permissions('clearance.offices')
  updateAgent(@Param('id') id: string, @Body() dto: UpdateClearanceAgentDto) {
    return this.service.updateAgent(id, dto);
  }

  @Patch('agents/:id/archive')
  @Permissions('clearance.offices')
  archiveAgent(@Param('id') id: string, @Body() dto: ArchiveClearanceAgentDto) {
    return this.service.archiveAgent(id, dto.archived);
  }

  @Delete('agents/:id')
  @Permissions('clearance.offices')
  deleteAgent(@Param('id') id: string) {
    return this.service.deleteAgent(id);
  }

  @Get('agents/:id/statement')
  @Permissions('clearance')
  statement(@Param('id') id: string, @Query() q: ClearanceQueryDto) {
    return this.service.statement(id, q);
  }

  // ── الحركات ──

  @Get()
  @Permissions('clearance')
  list(@Query() q: ClearanceQueryDto) {
    return this.service.list(q);
  }

  @Post('expense')
  @Permissions('clearance.expense', 'manifests.shipping')
  addExpense(@Body() dto: AddClearanceExpenseDto, @CurrentUser() user: any) {
    return this.service.addExpense(dto, user?.intId);
  }

  @Post('cash-expense')
  @Permissions('clearance.expense', 'manifests.shipping')
  addCashExpense(@Body() dto: AddCashClearanceDto, @CurrentUser() user: any) {
    return this.service.addCashExpense(dto, user?.intId);
  }

  @Post('pay')
  @Permissions('clearance.pay')
  pay(@Body() dto: PayClearanceAgentDto, @CurrentUser() user: any) {
    return this.service.pay(dto, user?.intId);
  }

  @Patch(':id')
  @Permissions('clearance.edit')
  update(@Param('id') id: string, @Body() dto: UpdateClearanceMovementDto) {
    return this.service.updateMovement(id, dto);
  }

  @Delete(':id')
  @Permissions('clearance.delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
