import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateProductDto, UpdateProductDto } from './dto/products.dto';
import { ProductsService } from './products.service';

@Controller('products')
@Permissions('inventory', 'invoices', 'settings', 'entry')
export class ProductsController {
  constructor(private service: ProductsService) {}

  // No @Permissions() here overrides the class-level — accessible to any authenticated user (including customers)
  @Get('catalog')
  @Permissions()
  catalog() {
    return this.service.catalog();
  }

  @Get()
  findAll(@Query() q: PaginationQueryDto) {
    return this.service.findAll(q);
  }

  @Get(':id/movements')
  movements(@Param('id') id: string) {
    return this.service.movements(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Permissions('settings', 'invoices')
  create(@Body() dto: CreateProductDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Permissions('settings')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions('settings')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
