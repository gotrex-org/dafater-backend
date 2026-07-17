import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { AssistantService } from './assistant.service';
import { AssistantController } from './assistant.controller';

@Module({ imports: [ReportsModule], providers: [AssistantService], controllers: [AssistantController] })
export class AssistantModule {}
