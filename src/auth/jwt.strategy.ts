import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  name: string;
  admin: boolean;
  ver: number; // tokenVersion at issue time
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
    // `sub` carries the user's public uid
    const user = await this.prisma.user.findUnique({ where: { uid: payload.sub } });
    if (!user) throw new UnauthorizedException();

    // revocation: a token is invalid once the user's tokenVersion moves past it
    if (payload.ver !== user.tokenVersion) {
      throw new UnauthorizedException('انتهت صلاحية الجلسة');
    }

    // trust the DB, not the token claims, for admin/views
    return { id: user.uid, name: user.name, admin: user.admin, views: user.views };
  }
}
