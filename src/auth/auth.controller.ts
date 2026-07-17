import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Get('users')
  loginUsers() {
    return this.auth.listLoginUsers();
  }

  // brute-force protection: max 5 login attempts per minute per IP
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  // نبضة أونلاين — بتحدّث آخر ظهور للمستخدم الحالي
  @Post('heartbeat')
  heartbeat(@CurrentUser('id') uid: string) {
    return this.auth.heartbeat(uid);
  }
}
