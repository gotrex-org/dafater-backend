import { Module } from '@nestjs/common';
import { PartiesService } from './parties.service';
import { PartiesController } from './parties.controller';

@Module({
  providers: [PartiesService],
  controllers: [PartiesController],
})
export class PartiesModule {}
