import { Injectable } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateManifestDto, UpdateManifestDto } from './dto/manifests.dto';
import { ManifestsRepository } from './manifests.repository';

@Injectable()
export class ManifestsService {
  constructor(private repo: ManifestsRepository) {}

  findAll(q: PaginationQueryDto) { return this.repo.findAll(q); }
  findOne(id: string) { return this.repo.findOne(id); }
  findForParty(partyUid: string) { return this.repo.findForParty(partyUid); }

  async create(dto: CreateManifestDto) {
    const finalNo = dto.no?.trim() || (await this.repo.nextNoForClient(dto.clientName));
    return this.repo.create(dto, finalNo);
  }

  async peekNextNo(clientName: string): Promise<{ no: string }> {
    return { no: await this.repo.nextNoForClient(clientName) };
  }

  update(id: string, dto: UpdateManifestDto) { return this.repo.update(id, dto); }
  remove(id: string) { return this.repo.remove(id); }
}
