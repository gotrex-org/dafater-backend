import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { SettlementModule } from '../settlement/settlement.module';

@Module({ imports: [SettlementModule], providers: [ReportsService], controllers: [ReportsController], exports: [ReportsService] })
export class ReportsModule {}
