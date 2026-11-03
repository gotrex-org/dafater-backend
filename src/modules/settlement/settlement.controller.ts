import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AdminOnly } from '../../common/decorators/admin.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Requester, SettlementService } from './settlement.service';
import { SettlementViewerGuard } from './settlement-viewer.guard';
import {
  CreatePartnerDto, CreatePriceListDto, PartnerUpsertDto, SelectInvoicesDto,
  SetItemWeekDto, UpdatePartnerVehicleDto, UpdatePriceListDto,
  CapitalMovementDto, FixedRateDto, PartnerPaymentDto, PostItemsDto, SelectItemsDto,
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
 * وفي التصفية الثابتة صاحب الاسم بيختار الأصناف من فواتير الشراء بنفسه (items)،
 * وبتستنى موافقة المالك اللي بتحصل بكتابة المبلغ للوحدة أو النسبة.
 *
 * مفيش endpoint لحذف قايمة أسعار بالقصد: الحسابات القديمة بتقرا من القوايم
 * القديمة، فالقايمة بتتعدّل ولا بتتمسح.
 */
@Controller('settlement')
@Permissions('settlement')
// حساب مربوط باسم (حتى لو أدمن) يرى تصفيته فقط — شوف SettlementViewerGuard
@UseGuards(SettlementViewerGuard)
export class SettlementController {
  constructor(private service: SettlementService) {}

  // ------------------------------- الأسماء -------------------------------

  /** تقرير التصفيات: رأس مال كل اسم ومستحقه وما سحبه ورصيده. */
  @Get('report')
  @AdminOnly()
  report() {
    return this.service.report();
  }

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

  /** الأصناف المختارة من فواتير الشراء ومستحق كل صنف. */
  @Get(':partnerId/fixed')
  fixed(@Param('partnerId') partnerId: string, @CurrentUser() me: Requester) {
    return this.service.fixedList(partnerId, me);
  }

  /** «اختيار الأصناف»: فواتير الشراء اللي فيها الصنف المكتوب، في الفترة. */
  @Get(':partnerId/items/search')
  searchItems(
    @Param('partnerId') partnerId: string,
    @CurrentUser() me: Requester,
    @Query('q') q: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.searchItems(partnerId, q, from, to, me);
  }

  /** صاحب الاسم يضيف بانتظار الموافقة، والمالك يضيف موافقاً عليه. */
  @Post(':partnerId/items')
  addItems(@Param('partnerId') partnerId: string, @Body() dto: SelectItemsDto, @CurrentUser() me: Requester) {
    return this.service.addItems(partnerId, dto, me);
  }

  /** إزالة صنف — للمدير فقط. */
  @Delete(':partnerId/items/:invoiceId/:productId')
  @AdminOnly()
  removeItem(
    @Param('partnerId') partnerId: string,
    @Param('invoiceId') invoiceId: string,
    @Param('productId') productId: string,
    @CurrentUser() me: Requester,
    @Query('kind') kind?: string,
  ) {
    return this.service.removeItem(partnerId, { invoiceId, productId, kind: kind === 'deal' ? 'deal' : 'invoice' }, me);
  }

  /** كتابة المبلغ للوحدة أو النسبة على صنف مختار — وهي الموافقة عليه. */
  @Put(':partnerId/items/:invoiceId/:productId')
  @AdminOnly()
  setItemRate(
    @Param('partnerId') partnerId: string,
    @Param('invoiceId') invoiceId: string,
    @Param('productId') productId: string,
    @Body() dto: FixedRateDto,
    @CurrentUser() me: Requester,
    @Query('kind') kind?: string,
  ) {
    return this.service.setItemRate(partnerId, { invoiceId, productId, kind: kind === 'deal' ? 'deal' : 'invoice' }, dto, me);
  }

  // -------------------------------- الترحيل --------------------------------

  /** ترحيل الأصناف المسعّرة لكشف الحساب مرة واحدة (زي قيمة فاتورة) — للمدير فقط. */
  @Post(':partnerId/postings')
  @AdminOnly()
  post(@Param('partnerId') partnerId: string, @Body() dto: PostItemsDto, @CurrentUser() me: Requester) {
    return this.service.postItems(partnerId, dto, me);
  }

  @Get(':partnerId/postings/:id')
  posting(@Param('partnerId') partnerId: string, @Param('id') id: string, @CurrentUser() me: Requester) {
    return this.service.postingDetail(partnerId, id, me);
  }

  @Delete(':partnerId/postings/:id')
  @AdminOnly()
  deletePosting(@Param('partnerId') partnerId: string, @Param('id') id: string, @CurrentUser() me: Requester) {
    return this.service.deletePosting(partnerId, id, me);
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

  /** فواتير البيع المرشّحة للتصفية برأس المال — للاختيار. */
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
