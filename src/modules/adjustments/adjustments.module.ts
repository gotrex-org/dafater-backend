import { Module } from '@nestjs/common';
import { AdjustmentsRepository } from './adjustments.repository';
import { AdjustmentsService } from './adjustments.service';
import { AdjustmentsController } from './adjustments.controller';

@Module({ providers: [AdjustmentsRepository, AdjustmentsService], controllers: [AdjustmentsController] })
export class AdjustmentsModule {}
