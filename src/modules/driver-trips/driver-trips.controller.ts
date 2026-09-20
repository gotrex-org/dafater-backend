import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { DriverTripsService } from './driver-trips.service';
import { AddPaymentDto, CreateDriverTripDto, LinkInvoiceDto, PatchWeightDiffDto, SetArrivalDto, UpdateDriverTripDto } from './dto/driver-trips.dto';
import { Permissions } from '../../common/decorators/permissions.decorator';

@Controller('driver-trips')
@Permissions('manifests', 'driver-trips')
export class DriverTripsController {
  constructor(private readonly service: DriverTripsService) {}

  @Get()
  findAll(@Query('status') status?: string, @Query('pendingBalance') pendingBalance?: string) {
    return this.service.findAll({ status, pendingBalance: pendingBalance === 'true' });
  }

  @Post()
  create(@Body() dto: CreateDriverTripDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDriverTripDto) {
    return this.service.update(id, dto);
  }

  // فواتير العميل اللي ينفع الرحلة تتربط بيها (فيها ناولون/خدمة ولسه فاضية)
  @Get(':id/invoice-candidates')
  invoiceCandidates(@Param('id') id: string) {
    return this.service.invoiceCandidates(id);
  }

  // ربط الرحلة بفاتورة — أو فك الربط بإرسال invoiceId فاضي
  @Patch(':id/invoice')
  linkInvoice(@Param('id') id: string, @Body() dto: LinkInvoiceDto) {
    return this.service.linkInvoice(id, dto.invoiceId?.trim() || null);
  }

  @Post(':id/payments')
  addPayment(@Param('id') id: string, @Body() dto: AddPaymentDto) {
    return this.service.addPayment(id, dto);
  }

  @Delete(':id/payments/:payId')
  deletePayment(@Param('id') id: string, @Param('payId') payId: string) {
    return this.service.deletePayment(id, payId);
  }

  @Patch(':id/arrival')
  setArrival(@Param('id') id: string, @Body() dto: SetArrivalDto) {
    return this.service.setArrival(id, dto);
  }

  @Patch(':id/weight-diff')
  updateWeightDiff(@Param('id') id: string, @Body() dto: PatchWeightDiffDto) {
    return this.service.updateWeightDiff(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
