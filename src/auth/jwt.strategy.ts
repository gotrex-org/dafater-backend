import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  name: string;
  admin: boolean;
  ver: number;
  role?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
      issuer: config.get<string>('JWT_ISSUER', 'dafater-api'),
      audience: config.get<string>('JWT_AUDIENCE', 'dafater-app'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { uid: payload.sub },
      include: { party: { select: { uid: true, id: true, name: true } } },
    });
    if (!user) throw new UnauthorizedException();
    if (payload.ver !== user.tokenVersion) throw new UnauthorizedException('انتهت صلاحية الجلسة');
    return {
      id: user.uid,
      intId: user.id,
      name: user.name,
      admin: user.admin,
      views: user.views,
      ledgerPartyIds: user.ledgerPartyIds ?? [],
      treasuryIds: user.treasuryIds ?? [],
      role: user.role,
      partyId: user.party?.uid,
      partyIntId: user.party?.id,
      partyName: user.party?.name,
    };
  }
}
