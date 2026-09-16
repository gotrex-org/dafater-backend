import { Module } from '@nestjs/common';
import { ClearanceRepository } from './clearance.repository';
import { ClearanceService } from './clearance.service';
import { ClearanceController } from './clearance.controller';

@Module({ providers: [ClearanceRepository, ClearanceService], controllers: [ClearanceController] })
export class ClearanceModule {}
