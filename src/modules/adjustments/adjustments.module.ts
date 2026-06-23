import {
  Body, Controller, Delete, Get, Injectable, Module, Param, Post, Query,
} from '@nestjs/common';
import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/pagination';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Permissions } from '../../common/decorators/permissions.decorator';

export class CreateAdjustmentDto {
  @IsDateString() date: string;
  @IsString() warehouseId: string;
  @IsString() productId: string;
  @IsNumber() qty: number; // net change (+/-)
  @IsOptional() @IsString() note?: string;
}

@Injectable()
export class AdjustmentsService {
  constructor(private prisma: PrismaService) {}
  findAll(q: PaginationQueryDto, warehouseId?: string) {
    // warehouseId query param is the public uid -> filter via the relation
    return paginate(this.prisma.adjustment, q, {
      where: warehouseId ? { warehouse: { uid: warehouseId } } : {},
      orderBy: { date: 'desc' },
      include: { product: true, warehouse: true },
    });
  }
  create(dto: CreateAdjustmentDto) {
    const { warehouseId, productId, date, ...rest } = dto;
    return this.prisma.adjustment.create({
      data: {
        ...rest,
        date: new Date(date),
        warehouse: { connect: { uid: warehouseId } },
        product: { connect: { uid: productId } },
      },
    });
  }
  remove(id: string) {
    return this.prisma.adjustment.delete({ where: { uid: id } });
  }
}

@Controller('adjustments')
@Permissions('inventory')
export class AdjustmentsController {
  constructor(private service: AdjustmentsService) {}
  @Get() findAll(@Query() q: PaginationQueryDto, @Query('warehouseId') warehouseId?: string) {
    return this.service.findAll(q, warehouseId);
  }
  @Post() create(@Body() dto: CreateAdjustmentDto) {
    return this.service.create(dto);
  }
  @Delete(':id') remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({ providers: [AdjustmentsService], controllers: [AdjustmentsController] })
export class AdjustmentsModule {}
