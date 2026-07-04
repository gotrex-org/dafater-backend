import { Module } from '@nestjs/common';
import { ManifestsRepository } from './manifests.repository';
import { ManifestsService } from './manifests.service';
import { ManifestsController } from './manifests.controller';
import { DriversModule } from '../drivers/drivers.module';

@Module({ imports: [DriversModule], providers: [ManifestsRepository, ManifestsService], controllers: [ManifestsController] })
export class ManifestsModule {}
