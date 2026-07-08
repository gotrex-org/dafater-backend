import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { InvoiceKind } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateProductDto, UpdateProductDto } from './dto/products.dto';
import { ProductsService } from './products.service';

@Controller('products')
@Permissions('inventory', 'invoices', 'settings', 'entry')
export class ProductsController {
  constructor(private service: ProductsService) {}

  // No JWT at all — feeds product-name suggestions to the public (no-login) order form.
  @Public()
  @Permissions()
  @Get('public-catalog')
  publicCatalog() {
    return this.service.catalog();
  }

  // No @Permissions() here overrides the class-level — accessible to any authenticated user (including customers)
  @Get('catalog')
  @Permissions()
  catalog() {
    return this.service.catalog();
  }

  // Must come before ':id' — otherwise "last-prices" is matched as an :id param.
  @Get('last-prices')
  @Permissions()
  lastPrices(@Query('kind') kind: InvoiceKind) {
    return this.service.lastPrices(kind);
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
  remove(@Param('id') id: string, @Query('cascade') cascade?: string) {
    return this.service.remove(id, cascade === 'true');
  }
}
