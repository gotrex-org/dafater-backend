import { Module } from '@nestjs/common';
import { DriverTripsRepository } from './driver-trips.repository';
import { DriverTripsService } from './driver-trips.service';
import { DriverTripsController } from './driver-trips.controller';

@Module({ providers: [DriverTripsRepository, DriverTripsService], controllers: [DriverTripsController] })
export class DriverTripsModule {}
