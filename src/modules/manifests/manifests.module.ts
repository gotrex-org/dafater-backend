import { Module } from '@nestjs/common';
import { ManifestsRepository } from './manifests.repository';
import { ManifestsService } from './manifests.service';
import { ManifestsController } from './manifests.controller';

@Module({ providers: [ManifestsRepository, ManifestsService], controllers: [ManifestsController] })
export class ManifestsModule {}
