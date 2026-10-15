import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { AdminOnly } from '../../common/decorators/admin.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Requester, SettlementService } from './settlement.service';
import {
  CreatePartnerDto, CreatePriceListDto, PartnerUpsertDto, SelectInvoicesDto,
  SetItemWeekDto, UpdatePartnerVehicleDto, UpdatePriceListDto,
  CapitalMovementDto, FixedRateDto, PartnerPaymentDto,
} from './dto/settlement.dto';

/**
 * تاب «تصفية» — تصفية حساب كل اسم على أصناف مورده.
 *
 * الصلاحيات: `settlement` بتفتح التاب للقراءة، و`settlement.prices` بتسمح
 * بقوايم الأسعار الأسبوعية — ودي الحاجة الوحيدة اللي صاحب الاسم بيكتبها
 * (وعلى أحدث أسبوع بس، شوف SettlementService.updatePriceList). اختيار
 * الفواتير ورأس المال والمبلغ للوحدة وأسبوع الصنف والأسماء نفسها للأدمن بس.
 *
 * وكمان: اللي مش أدمن بيشوف التصفية المربوطة بحسابه بس — مش كل الأسماء.
 *
 * مفيش endpoint لحذف قايمة أسعار بالقصد: الحسابات القديمة بتقرا من القوايم
 * القديمة، فالقايمة بتتعدّل ولا بتتمسح.
 */
@Controller('settlement')
@Permissions('settlement')
export class SettlementController {
  constructor(private service: SettlementService) {}

  // ------------------------------- الأسماء -------------------------------

  @Get('partners')
  partners(@CurrentUser() me: Requester) {
    return this.service.partners(me);
  }

  @Post('partners')
  @AdminOnly()
  createPartner(@Body() dto: CreatePartnerDto) {
    return this.service.createPartner(dto);
  }

  @Patch('partners/:id')
  @AdminOnly()
  updatePartner(@Param('id') id: string, @Body() dto: PartnerUpsertDto) {
    return this.service.updatePartner(id, dto);
  }

  @Delete('partners/:id')
  @AdminOnly()
  deletePartner(@Param('id') id: string) {
    return this.service.deletePartner(id);
  }

  // ---------------------------- قوايم الأسعار ----------------------------

  @Get(':partnerId/price-lists')
  priceLists(@Param('partnerId') partnerId: string, @CurrentUser() me: Requester) {
    return this.service.priceLists(partnerId, me);
  }

  @Get(':partnerId/products')
  products(
    @Param('partnerId') partnerId: string,
    @CurrentUser() me: Requester,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.service.products(partnerId, me, supplierId);
  }

  @Post(':partnerId/price-lists')
  @Permissions('settlement.prices')
  createPriceList(
    @Param('partnerId') partnerId: string,
    @Body() dto: CreatePriceListDto,
    @CurrentUser() me: Requester,
  ) {
    return this.service.createPriceList(partnerId, dto, me);
  }

  @Patch(':partnerId/price-lists/:id')
  @Permissions('settlement.prices')
  updatePriceList(
    @Param('partnerId') partnerId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePriceListDto,
    @CurrentUser() me: Requester,
  ) {
    return this.service.updatePriceList(partnerId, id, dto, me);
  }

  // --------------------------- حركات رأس المال ---------------------------

  @Get(':partnerId/capital')
  capital(@Param('partnerId') partnerId: string, @CurrentUser() me: Requester) {
    return this.service.capital(partnerId, me);
  }

  /** إضافة أو نقص رأس مال على القديم — المبلغ الموجب إضافة والسالب نقص. */
  @Post(':partnerId/capital')
  @AdminOnly()
  addCapital(
    @Param('partnerId') partnerId: string,
    @Body() dto: CapitalMovementDto,
    @CurrentUser() me: Requester,
  ) {
    return this.service.addCapitalMovement(partnerId, dto, me);
  }

  @Delete(':partnerId/capital/:id')
  @AdminOnly()
  deleteCapital(
    @Param('partnerId') partnerId: string,
    @Param('id') id: string,
    @CurrentUser() me: Requester,
  ) {
    return this.service.deleteCapitalMovement(partnerId, id, me);
  }

  // ---------------------------- التصفية الثابتة ----------------------------

  /** فواتير الشراء المختارة ومستحق كل واحدة. */
  @Get(':partnerId/fixed')
  fixed(@Param('partnerId') partnerId: string, @CurrentUser() me: Requester) {
    return this.service.fixedList(partnerId, me);
  }

  /** كتابة المبلغ للوحدة على فاتورة شراء مختارة. */
  @Put(':partnerId/fixed/:invoiceId')
  @AdminOnly()
  setFixedRate(
    @Param('partnerId') partnerId: string,
    @Param('invoiceId') invoiceId: string,
    @Body() dto: FixedRateDto,
    @CurrentUser() me: Requester,
  ) {
    return this.service.setFixedRate(partnerId, invoiceId, dto.rate, me);
  }

  // ------------------------------ كشف الحساب ------------------------------

  @Get(':partnerId/statement')
  statement(@Param('partnerId') partnerId: string, @CurrentUser() me: Requester) {
    return this.service.statement(partnerId, me);
  }

  /** الدفعات: صاحب الاسم يقرأ ما تسلّمه، والتسجيل والحذف للمالك. */
  @Get(':partnerId/payments')
  payments(@Param('partnerId') partnerId: string, @CurrentUser() me: Requester) {
    return this.service.payments(partnerId, me);
  }

  @Post(':partnerId/payments')
  @AdminOnly()
  addPayment(
    @Param('partnerId') partnerId: string,
    @Body() dto: PartnerPaymentDto,
    @CurrentUser() me: Requester,
  ) {
    return this.service.addPayment(partnerId, dto, me);
  }

  @Delete(':partnerId/payments/:id')
  @AdminOnly()
  deletePayment(
    @Param('partnerId') partnerId: string,
    @Param('id') id: string,
    @CurrentUser() me: Requester,
  ) {
    return this.service.deletePayment(partnerId, id, me);
  }

  // ------------------------------- العربيات -------------------------------

  @Get(':partnerId/overview')
  overview(@Param('partnerId') partnerId: string, @CurrentUser() me: Requester) {
    return this.service.overview(partnerId, me);
  }

  /** كل فواتير البيع اللي فيها أصناف المورد — للاختيار. */
  @Get(':partnerId/candidates')
  @AdminOnly()
  candidates(@Param('partnerId') partnerId: string, @CurrentUser() me: Requester) {
    return this.service.candidates(partnerId, me);
  }

  @Get(':partnerId/vehicles/:invoiceId')
  vehicle(
    @Param('partnerId') partnerId: string,
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() me: Requester,
  ) {
    return this.service.vehicle(partnerId, invoiceId, me);
  }

  @Post(':partnerId/vehicles')
  @AdminOnly()
  select(
    @Param('partnerId') partnerId: string,
    @Body() dto: SelectInvoicesDto,
    @CurrentUser() me: Requester,
  ) {
    return this.service.selectInvoices(partnerId, dto, me);
  }

  /** «كل الفواتير مرة واحدة». */
  @Post(':partnerId/vehicles-all')
  @AdminOnly()
  selectAll(@Param('partnerId') partnerId: string, @CurrentUser() me: Requester) {
    return this.service.selectAll(partnerId, me);
  }

  @Patch(':partnerId/vehicles/:invoiceId')
  @AdminOnly()
  updateVehicle(
    @Param('partnerId') partnerId: string,
    @Param('invoiceId') invoiceId: string,
    @Body() dto: UpdatePartnerVehicleDto,
    @CurrentUser() me: Requester,
  ) {
    return this.service.updateVehicle(partnerId, invoiceId, dto, me);
  }

  @Delete(':partnerId/vehicles/:invoiceId')
  @AdminOnly()
  unselect(
    @Param('partnerId') partnerId: string,
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() me: Requester,
  ) {
    return this.service.unselectInvoice(partnerId, invoiceId, me);
  }

  /** فرض أسبوع على صنف في فاتورة (الدفع اتقسم على أسبوعين). */
  @Put(':partnerId/vehicles/:invoiceId/week')
  @AdminOnly()
  setItemWeek(
    @Param('partnerId') partnerId: string,
    @Param('invoiceId') invoiceId: string,
    @Body() dto: SetItemWeekDto,
    @CurrentUser() me: Requester,
  ) {
    return this.service.setItemWeek(partnerId, invoiceId, dto, me);
  }
}
