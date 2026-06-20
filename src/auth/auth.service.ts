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

  /** Public list for the login user-picker (no secrets). */
  async listLoginUsers() {
    const users = await this.prisma.user.findMany({
      select: { id: true, name: true, admin: true },
      orderBy: { createdAt: 'asc' },
    });
    return users;
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new UnauthorizedException('مستخدم غير موجود');

    const ok = await bcrypt.compare(dto.pin, user.pinHash);
    if (!ok) throw new UnauthorizedException('الرقم السري غير صحيح');

    const token = await this.jwt.signAsync({
      sub: user.id,
      name: user.name,
      admin: user.admin,
      ver: user.tokenVersion,
    });

    return {
      token,
      user: { id: user.id, name: user.name, admin: user.admin, views: user.views },
    };
  }
}
