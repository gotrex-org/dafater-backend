import {
  Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/pagination';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Permissions } from '../../common/decorators/permissions.decorator';

export class RequestItemDto {
  @IsString() name: string;
  @IsNumber() qty: number;
}
export class CreateRequestDto {
  @IsDateString() date: string;
  @IsString() clientId: string;
  @IsOptional() @IsString() note?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => RequestItemDto) items: RequestItemDto[];
}

@Injectable()
export class RequestsService {
  constructor(private prisma: PrismaService) {}
  findAll(q: PaginationQueryDto, done?: boolean) {
    return paginate(this.prisma.request, q, {
      where: done === undefined ? {} : { done },
      orderBy: { date: 'desc' },
      include: { client: true, items: true },
    });
  }
  create(dto: CreateRequestDto) {
    return this.prisma.request.create({
      data: {
        date: new Date(dto.date), clientId: dto.clientId, note: dto.note,
        items: { create: dto.items },
      },
      include: { items: true, client: true },
    });
  }
  markDone(id: string) {
    return this.prisma.request.update({
      where: { id },
      data: { done: true, doneDate: new Date() },
    });
  }
  remove(id: string) {
    return this.prisma.request.delete({ where: { id } });
  }
}

@Controller('requests')
@Permissions('requests')
export class RequestsController {
  constructor(private service: RequestsService) {}
  @Get() findAll(@Query() q: PaginationQueryDto) {
    return this.service.findAll(q, false);
  }
  @Post() create(@Body() dto: CreateRequestDto) {
    return this.service.create(dto);
  }
  @Patch(':id/done') markDone(@Param('id') id: string) {
    return this.service.markDone(id);
  }
  @Delete(':id') remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({ providers: [RequestsService], controllers: [RequestsController] })
export class RequestsModule {}
