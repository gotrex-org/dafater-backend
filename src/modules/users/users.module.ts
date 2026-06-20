import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
  Injectable, BadRequestException, Module,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminOnly } from '../../common/decorators/admin.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';

export class CreateUserDto {
  @IsString() name: string;
  @IsString() @Length(4, 8) pin: string;
  @IsOptional() @IsBoolean() admin?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) views?: string[];
}
export class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() @Length(4, 8) pin?: string;
  @IsOptional() @IsBoolean() admin?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) views?: string[];
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAll(q: PaginationQueryDto) {
    return paginate(this.prisma.user, q, {
      select: { id: true, name: true, admin: true, views: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(dto: CreateUserDto) {
    const { pin, ...rest } = dto;
    const user = await this.prisma.user.create({
      data: { ...rest, views: dto.views ?? [], pinHash: await bcrypt.hash(pin, 10) },
    });
    return { id: user.id, name: user.name, admin: user.admin, views: user.views };
  }

  async update(id: string, dto: UpdateUserDto) {
    const { pin, ...rest } = dto;
    const data: any = { ...rest };
    if (pin) {
      data.pinHash = await bcrypt.hash(pin, 10);
      // changing the PIN revokes all existing tokens for this user
      data.tokenVersion = { increment: 1 };
    }
    const user = await this.prisma.user.update({ where: { id }, data });
    return { id: user.id, name: user.name, admin: user.admin, views: user.views };
  }

  async remove(id: string) {
    const count = await this.prisma.user.count();
    if (count <= 1) throw new BadRequestException('لا يمكن حذف آخر مستخدم');
    return this.prisma.user.delete({ where: { id } });
  }
}

@Controller('users')
@AdminOnly()
export class UsersController {
  constructor(private service: UsersService) {}
  @Get() findAll(@Query() q: PaginationQueryDto) {
    return this.service.findAll(q);
  }
  @Post() create(@Body() dto: CreateUserDto) {
    return this.service.create(dto);
  }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.service.update(id, dto);
  }
  @Delete(':id') remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({ providers: [UsersService], controllers: [UsersController] })
export class UsersModule {}
