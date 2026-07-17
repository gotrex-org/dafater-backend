import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';
import { UsersRepository } from './users.repository';

// أونلاين لو ظهر خلال آخر دقيقتين (النبضة بتيجي كل دقيقة).
const ONLINE_MS = 125_000;

function fmt(u: any) {
  const lastSeenAt = u.lastSeenAt ?? null;
  const online = !!lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < ONLINE_MS;
  return {
    id: u.uid,
    username: u.username ?? null,
    name: u.name,
    admin: u.admin,
    isPrimary: u.isPrimary,
    views: u.views,
    ledgerPartyIds: u.ledgerPartyIds ?? [],
    treasuryIds: u.treasuryIds ?? [],
    role: u.role,
    createdAt: u.createdAt,
    lastSeenAt,
    online,
    party: u.party ? { id: u.party.uid, name: u.party.name } : null,
  };
}

@Injectable()
export class UsersService {
  constructor(private repo: UsersRepository) {}

  async findAll(q: PaginationQueryDto) {
    const result = await this.repo.findAll(q);
    return { ...result, data: result.data.map((u: any) => ({ ...fmt(u), pinHash: undefined })) };
  }

  async create(dto: CreateUserDto) {
    const { pin, partyId, username, ledgerPartyIds, treasuryIds, ...rest } = dto;
    const data: any = { ...rest, views: dto.views ?? [], ledgerPartyIds: ledgerPartyIds ?? [], treasuryIds: treasuryIds ?? [], pinHash: await bcrypt.hash(pin, 10), ...(username ? { username } : {}) };
    if (partyId) {
      const party = await this.repo.findPartyByUid(partyId);
      data.partyId = party.id;
    }
    const user = await this.repo.create(data);
    return fmt(user);
  }

  async update(id: string, dto: UpdateUserDto, currentUser?: { id?: string; isPrimary?: boolean }) {
    await this.assertCanTouchPrimary(id, currentUser);
    // `isPrimary` is not editable through the API — the owner flag is set once by the
    // migration and never toggled from the UI.
    const { pin, partyId, username, ledgerPartyIds, treasuryIds, isPrimary: _ignore, ...rest } = dto as any;
    const data: any = { ...rest };
    if (ledgerPartyIds !== undefined) data.ledgerPartyIds = ledgerPartyIds;
    if (treasuryIds !== undefined) data.treasuryIds = treasuryIds;
    if (username !== undefined) data.username = username || null;
    if (pin) {
      data.pinHash = await bcrypt.hash(pin, 10);
      data.tokenVersion = { increment: 1 };
    }
    if (partyId !== undefined) {
      if (partyId) {
        const party = await this.repo.findPartyByUid(partyId);
        data.partyId = party.id;
      } else {
        data.partyId = null;
      }
    }
    const user = await this.repo.update(id, data);
    return fmt(user);
  }

  async remove(id: string, currentUser?: { id?: string; isPrimary?: boolean }) {
    const target = await this.repo.findByUid(id);
    if (target?.isPrimary) throw new ForbiddenException('لا يمكن حذف المستخدم الأساسي');
    const count = await this.repo.count();
    if (count <= 1) throw new BadRequestException('لا يمكن حذف آخر مستخدم');
    return this.repo.remove(id);
  }

  // Only the primary (owner) user may edit the primary user's account (details,
  // password, permissions). No other user — not even another admin — can touch it.
  private async assertCanTouchPrimary(id: string, currentUser?: { id?: string; isPrimary?: boolean }) {
    const target = await this.repo.findByUid(id);
    if (target?.isPrimary && !currentUser?.isPrimary) {
      throw new ForbiddenException('لا يمكن تعديل المستخدم الأساسي');
    }
  }
}
