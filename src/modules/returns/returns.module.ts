import { Module } from '@nestjs/common';
import { ReturnsRepository } from './returns.repository';
import { ReturnsService } from './returns.service';
import { ReturnsController } from './returns.controller';

@Module({ providers: [ReturnsRepository, ReturnsService], controllers: [ReturnsController] })
export class ReturnsModule {}
