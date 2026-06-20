import { Body, Controller, Delete, Get, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/pagination';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Permissions } from '../../common/decorators/permissions.decorator';

export class ManifestItemDto {
  @IsString() name: string;
  @IsNumber() qty: number;
}
export class CreateManifestDto {
  @IsString() no: string;
  @IsDateString() date: string;
  @IsString() clientName: string;
  @IsOptional() @IsString() invoiceId?: string;
  @IsOptional() @IsString() vehicleNo?: string;
  @IsOptional() @IsString() driverName?: string;
  @IsOptional() @IsString() driverPhone?: string;
  @IsOptional() @IsString() driverNID?: string;
  @IsOptional() @IsString() clearingAgent?: string;
  @IsOptional() @IsString() note?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ManifestItemDto) items: ManifestItemDto[];
}

@Injectable()
export class ManifestsService {
  constructor(private prisma: PrismaService) {}
  findAll(q: PaginationQueryDto) {
    return paginate(this.prisma.manifest, q, { orderBy: { date: 'desc' }, include: { items: true } });
  }
  findOne(id: string) {
    return this.prisma.manifest.findUnique({ where: { id }, include: { items: true } });
  }
  create(dto: CreateManifestDto) {
    const { items, date, ...rest } = dto;
    return this.prisma.manifest.create({
      data: { ...rest, date: new Date(date), items: { create: items } },
      include: { items: true },
    });
  }
  remove(id: string) {
    return this.prisma.manifest.delete({ where: { id } });
  }
}

@Controller('manifests')
@Permissions('manifests')
export class ManifestsController {
  constructor(private service: ManifestsService) {}
  @Get() findAll(@Query() q: PaginationQueryDto) {
    return this.service.findAll(q);
  }
  @Get(':id') findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
  @Post() create(@Body() dto: CreateManifestDto) {
    return this.service.create(dto);
  }
  @Delete(':id') remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({ providers: [ManifestsService], controllers: [ManifestsController] })
export class ManifestsModule {}
