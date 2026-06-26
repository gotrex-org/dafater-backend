import { Injectable } from '@nestjs/common';
import { UpdateConfigDto } from './dto/config.dto';
import { AppConfigRepository } from './config.repository';

@Injectable()
export class AppConfigService {
  constructor(private repo: AppConfigRepository) {}

  get() { return this.repo.get(); }
  update(dto: UpdateConfigDto) { return this.repo.update(dto); }
}
