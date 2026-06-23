import { Module } from '@nestjs/common';
import { AdjustmentsService } from './adjustments.service';
import { AdjustmentsController } from './adjustments.controller';

@Module({ providers: [AdjustmentsService], controllers: [AdjustmentsController] })
export class AdjustmentsModule {}
