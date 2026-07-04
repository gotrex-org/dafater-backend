import { Injectable } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateRequestDto, ReceiveDto } from './dto/requests.dto';
import { RequestsRepository } from './requests.repository';

@Injectable()
export class RequestsService {
  constructor(private repo: RequestsRepository) {}

  findAll(q: PaginationQueryDto, done?: boolean, clientId?: string) {
    return this.repo.findAll(q, done, clientId);
  }

  create(dto: CreateRequestDto) { return this.repo.create(dto); }
  markDone(id: string) { return this.repo.markDone(id); }
  receive(id: string, dto: ReceiveDto) { return this.repo.receive(id, dto); }
  remove(id: string) { return this.repo.remove(id); }
}
