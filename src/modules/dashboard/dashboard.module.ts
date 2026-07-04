import { Module } from '@nestjs/common';
import { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({ providers: [DashboardRepository, DashboardService], controllers: [DashboardController] })
export class DashboardModule {}
