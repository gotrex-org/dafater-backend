import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/pagination';
import { Permissions } from '../../common/decorators/permissions.decorator';

export class CreateProductDto {
  @IsString() name: string;
  @IsOptional() @IsString() unit?: string;
}

export class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() unit?: string;
}

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}
  findAll(q: PaginationQueryDto) {
    return paginate(this.prisma.product, q, {
      where: q.search ? { name: { contains: q.search, mode: 'insensitive' as const } } : {},
      orderBy: { name: 'asc' },
    });
  }
  findOne(id: string) {
    return this.prisma.product.findUnique({ where: { id } });
  }
  create(dto: CreateProductDto) {
    return this.prisma.product.create({ data: dto });
  }
  update(id: string, dto: UpdateProductDto) {
    return this.prisma.product.update({ where: { id }, data: dto });
  }
  remove(id: string) {
    return this.prisma.product.delete({ where: { id } });
  }
}

@Controller('products')
@Permissions('inventory', 'invoices', 'settings', 'entry')
export class ProductsController {
  constructor(private service: ProductsService) {}
  @Get() findAll(@Query() q: PaginationQueryDto) {
    return this.service.findAll(q);
  }
  @Get(':id') findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
  @Post() @Permissions('settings', 'invoices') create(@Body() dto: CreateProductDto) {
    return this.service.create(dto);
  }
  @Patch(':id') @Permissions('settings') update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.service.update(id, dto);
  }
  @Delete(':id') @Permissions('settings') remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({ providers: [ProductsService], controllers: [ProductsController] })
export class ProductsModule {}
