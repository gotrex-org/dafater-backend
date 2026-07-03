import { Module } from '@nestjs/common';
import { DriverTripsRepository } from './driver-trips.repository';
import { DriverTripsService } from './driver-trips.service';
import { DriverTripsController } from './driver-trips.controller';
import { DriversModule } from '../drivers/drivers.module';
import { AppConfigModule } from '../config/config.module';

@Module({
  imports: [DriversModule, AppConfigModule],
  providers: [DriverTripsRepository, DriverTripsService],
  controllers: [DriverTripsController],
})
export class DriverTripsModule {}
