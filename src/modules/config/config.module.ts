import { Body, Controller, Get, Injectable, Module, Put } from '@nestjs/common';
import { IsEmail } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../../common/decorators/public.decorator';
import { AdminOnly } from '../../common/decorators/admin.decorator';

export class UpdateConfigDto {
  @IsEmail() orderEmail: string;
}

@Injectable()
export class AppConfigService {
  constructor(private prisma: PrismaService) {}
  get() {
    return this.prisma.config.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  }
  update(dto: UpdateConfigDto) {
    return this.prisma.config.upsert({
      where: { id: 1 },
      update: { orderEmail: dto.orderEmail },
      create: { id: 1, orderEmail: dto.orderEmail },
    });
  }
}

@Controller('config')
export class AppConfigController {
  constructor(private service: AppConfigService) {}
  @Public() @Get() get() {
    return this.service.get();
  }
  @AdminOnly() @Put() update(@Body() dto: UpdateConfigDto) {
    return this.service.update(dto);
  }
}

@Module({ providers: [AppConfigService], controllers: [AppConfigController] })
export class AppConfigModule {}
