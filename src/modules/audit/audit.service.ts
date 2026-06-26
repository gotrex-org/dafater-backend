import { Injectable } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { AuditRepository } from './audit.repository';

@Injectable()
export class AuditService {
  constructor(private repo: AuditRepository) {}

  findAll(q: PaginationQueryDto, user?: string) {
    return this.repo.findAll(q, user);
  }
}
