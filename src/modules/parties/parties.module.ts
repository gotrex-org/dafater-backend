import { Module } from '@nestjs/common';
import { PartiesRepository } from './parties.repository';
import { PartiesService } from './parties.service';
import { PartiesController } from './parties.controller';

@Module({
  providers: [PartiesRepository, PartiesService],
  controllers: [PartiesController],
})
export class PartiesModule {}
