import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { InvoiceKind } from '@prisma/client';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateInvoiceDto, UpdateInvoiceDto, CommissionDto, ManifestTabClosedDto } from './dto/invoices.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
@Permissions('invoices')
export class InvoicesController {
  constructor(private service: InvoicesService) {}

  @Get()
  findAll(@Query() q: PaginationQueryDto, @Query('kind') kind?: InvoiceKind, @Query('partyId') partyId?: string) {
    return this.service.findAll(q, kind, partyId);
  }

  @Get('next-no')
  nextNo(@Query('partyId') partyId: string) {
    return this.service.peekNextNo(partyId);
  }

  // بوابة العميل — أي مستخدم داخل يقدر يفتح فاتورة طرفه هو بس (الفحص جوّه الخدمة).
  // ملاحظة ترتيب: 'my' و'my/:uid/manifest-tabs' لازم يبقوا قبل 'my/:uid' وقبل ':id'
  // عشان Nest بيطابق أول راوت مناسب.
  @Get('my')
  @Permissions()
  myInvoices(@Req() req: Request) {
    return this.service.myInvoices((req as any).user?.partyId);
  }

  @Get('my/:uid/manifest-tabs')
  @Permissions()
  myManifestTabs(@Req() req: Request, @Param('uid') uid: string) {
    return this.service.myManifestTabs((req as any).user?.partyId, uid);
  }

  @Get('my/:uid')
  @Permissions()
  myInvoice(@Req() req: Request, @Param('uid') uid: string) {
    return this.service.myInvoice((req as any).user?.partyId, uid);
  }

  // بيانات شكل الشيت: حساب قديم + سدادات الفترة + الباقي عليه
  @Get(':id/sheet')
  sheet(@Param('id') id: string) {
    return this.service.sheet(id);
  }

  // تابات العربيات: تاب لكل عربية بأصنافها ومصاريفها في نافذتها الزمنية
  @Get(':id/manifest-tabs')
  manifestTabs(@Param('id') id: string) {
    return this.service.manifestTabs(id);
  }

  // قفل/فتح تاب عربية — بعد القفل ما بياخدش مصاريف جديدة بالتاريخ
  @Patch('manifest-tabs/:uid/closed')
  @Permissions('manifests.close')
  setManifestTabClosed(@Param('uid') uid: string, @Body() dto: ManifestTabClosedDto, @CurrentUser() user: any) {
    return this.service.setManifestTabClosed(uid, dto.closed, user?.name);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: any) {
    return this.service.create(dto, user?.intId);
  }

  @Patch(':id/commission')
  @Permissions('invoices.commission')
  updateCommission(@Param('id') id: string, @Body() dto: CommissionDto) {
    return this.service.updateCommission(id, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user?.intId);
  }

  @Delete(':id')
  @Permissions('invoices.delete')
  remove(@Param('id') id: string, @Query('cascade') cascade?: string) {
    return this.service.remove(id, cascade === 'true');
  }
}
