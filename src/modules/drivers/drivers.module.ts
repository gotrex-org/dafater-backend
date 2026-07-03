import { Module } from '@nestjs/common';
import { DriversRepository } from './drivers.repository';
import { DriversService } from './drivers.service';
import { DriversController } from './drivers.controller';

@Module({
  providers: [DriversRepository, DriversService],
  controllers: [DriversController],
  exports: [DriversService],
})
export class DriversModule {}
