import { Module } from '@nestjs/common';
import { RequestsRepository } from './requests.repository';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';

@Module({ providers: [RequestsRepository, RequestsService], controllers: [RequestsController] })
export class RequestsModule {}
