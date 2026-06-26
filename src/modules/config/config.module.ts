import { Module } from '@nestjs/common';
import { AppConfigRepository } from './config.repository';
import { AppConfigService } from './config.service';
import { AppConfigController } from './config.controller';

@Module({ providers: [AppConfigRepository, AppConfigService], controllers: [AppConfigController] })
export class AppConfigModule {}
