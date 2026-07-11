import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async listLoginUsers() {
    const users = await this.prisma.user.findMany({
      select: { uid: true, name: true, admin: true },
      orderBy: { createdAt: 'asc' },
    });
    return users;
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      include: { party: { select: { uid: true, name: true } } },
    });
    const ok = user && await bcrypt.compare(dto.password, user.pinHash);
    if (!user || !ok) throw new UnauthorizedException('اسم المستخدم أو كلمة المرور غير صحيحة');

    const token = await this.jwt.signAsync({
      sub: user.uid,
      name: user.name,
      admin: user.admin,
      ver: user.tokenVersion,
      role: user.role,
    });

    return {
      token,
      user: {
        id: user.uid,
        name: user.name,
        admin: user.admin,
        isPrimary: user.isPrimary,
        views: user.views,
        ledgerPartyIds: user.ledgerPartyIds ?? [],
        treasuryIds: user.treasuryIds ?? [],
        role: user.role,
        ...(user.party ? { partyId: user.party.uid, partyName: user.party.name } : {}),
      },
    };
  }
}
