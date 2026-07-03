import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AdminOnly as Admin } from '../../common/decorators/admin.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CreateAgentDto, UpdateAgentDto, EgpInDto, UsdOutDto, SettleDto } from './dto/forex.dto';
import { ForexService } from './forex.service';

@Controller('forex')
@Permissions('forex')
export class ForexController {
  constructor(private service: ForexService) {}

  @Get()
  findAll() { return this.service.findAll(); }

  @Get(':uid')
  findOne(@Param('uid') uid: string) { return this.service.findOne(uid); }

  @Post()
  @Admin()
  create(@Body() dto: CreateAgentDto) { return this.service.create(dto); }

  @Patch(':uid')
  @Admin()
  update(@Param('uid') uid: string, @Body() dto: UpdateAgentDto) { return this.service.update(uid, dto); }

  @Delete(':uid')
  @Admin()
  remove(@Param('uid') uid: string) { return this.service.remove(uid); }

  @Post(':uid/egp-in')
  egpIn(@Param('uid') uid: string, @Body() dto: EgpInDto) { return this.service.egpIn(uid, dto); }

  @Post(':uid/usd-out')
  usdOut(@Param('uid') uid: string, @Body() dto: UsdOutDto) { return this.service.usdOut(uid, dto); }

  @Post(':uid/settle')
  settle(@Param('uid') uid: string, @Body() dto: SettleDto) { return this.service.settle(uid, dto); }

  @Delete('tx/:txUid')
  @Admin()
  deleteTx(@Param('txUid') txUid: string) { return this.service.deleteTx(txUid); }
}
