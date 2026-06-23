import { Module } from '@nestjs/common';
import { ManifestsService } from './manifests.service';
import { ManifestsController } from './manifests.controller';

@Module({ providers: [ManifestsService], controllers: [ManifestsController] })
export class ManifestsModule {}
