import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AddPaymentDto, CreateDriverTripDto, PatchWeightDiffDto, SetArrivalDto, UpdateDriverTripDto } from './dto/driver-trips.dto';
import { DriverTripsRepository } from './driver-trips.repository';
import { DriversService } from '../drivers/drivers.service';
import { AppConfigService } from '../config/config.service';

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

@Injectable()
export class DriverTripsService {
  constructor(
    private repo: DriverTripsRepository,
    private driversService: DriversService,
    private configService: AppConfigService,
  ) {}

  async create(dto: CreateDriverTripDto) {
    let manifestId: number | null = null;
    if (dto.manifestId) {
      const m = await this.repo.findManifestByUid(dto.manifestId);
      if (!m) throw new NotFoundException('الكشف غير موجود');
      manifestId = m.id;
    }
    let partyId: number | null = null;
    let resolvedClientName = dto.clientName?.trim() || '';
    if (dto.partyId) {
      const p = await this.repo.findPartyByUid(dto.partyId);
      if (p) { partyId = p.id; if (!resolvedClientName) resolvedClientName = p.name; }
    }
    if (!resolvedClientName) throw new BadRequestException('يجب تحديد العميل');

    const trip = await this.repo.createTrip({
      manifestId,
      partyId,
      driverName: dto.driverName.trim(),
      vehicleNo: dto.vehicleNo?.trim() || null,
      trailerNo: dto.trailerNo?.trim() || null,
      clientName: resolvedClientName,
      departureDate: new Date(dto.departureDate),
      agreedFreight: dto.agreedFreight,
      note: dto.note?.trim() || null,
    });

    // auto-register the driver in the drivers registry (upsert by name — no-op if already exists)
    this.driversService.upsertByName(dto.driverName.trim()).catch(() => {});

    if (dto.initialPaid && dto.initialPaid > 0) {
      if (dto.initialPaid > dto.agreedFreight + 0.001)
        throw new BadRequestException(`الدفعة المقدمة (${dto.initialPaid}) أكبر من الناولون المتفق عليه (${dto.agreedFreight})`);
      await this.repo.createPayment({
        tripId: trip.id,
        date: new Date(dto.departureDate),
        amount: dto.initialPaid,
        paymentType: 'freight',
        note: dto.initialPaidNote?.trim() || 'دفعة أولى',
      });
      if (dto.initialPaidTreasuryId) {
        const treasury = await this.repo.findTreasuryByUid(dto.initialPaidTreasuryId);
        if (treasury) {
          await this.repo.createTreasuryTx({
            date: new Date(dto.departureDate),
            type: 'driverFreight',
            cashOut: dto.initialPaid,
            treasuryId: treasury.id,
            note: `دفعة أولى ناولون (${dto.driverName.trim()})`,
          });
        }
      }
    }

    if (dto.teaMoney && dto.teaMoney > 0) {
      await this.repo.createPayment({
        tripId: trip.id,
        date: new Date(dto.departureDate),
        amount: dto.teaMoney,
        paymentType: 'tea',
        note: 'شاي سائق',
      });
      if (dto.teaTreasuryId) {
        const treasury = await this.repo.findTreasuryByUid(dto.teaTreasuryId);
        if (treasury) {
          await this.repo.createTreasuryTx({
            date: new Date(dto.departureDate),
            type: 'driverTea',
            cashOut: dto.teaMoney,
            treasuryId: treasury.id,
            note: `شاي سائق (${dto.driverName.trim()})`,
          });
        }
      }
    }

    return this.findOne(trip.uid);
  }

  async findAll(filters: { status?: string; pendingBalance?: boolean }) {
    const trips = await this.repo.findAll();
    const enriched = trips.map((t) => {
      const payments = (t as any).payments as Array<{ paymentType: string; amount: number }>;
      const totalFreightPaid    = payments.filter((p) => p.paymentType === 'freight').reduce((s, p) => s + p.amount, 0);
      const totalDelayPaid      = payments.filter((p) => p.paymentType === 'delay').reduce((s, p) => s + p.amount, 0);
      const totalWeightDiffPaid = payments.filter((p) => p.paymentType === 'weightDiff').reduce((s, p) => s + p.amount, 0);
      const remainingFreight    = Math.max(0, t.agreedFreight - totalFreightPaid);
      const remainingDelay      = Math.max(0, (t.delayFee ?? 0) - totalDelayPaid);
      const remainingWeightDiff = Math.max(0, (t.weightDiffAmount ?? 0) - totalWeightDiffPaid);
      const trulyClosed = !!t.arrivalDate && remainingDelay === 0 && remainingWeightDiff === 0;
      return { ...t, totalFreightPaid, totalDelayPaid, totalWeightDiffPaid, remainingFreight, remainingDelay, remainingWeightDiff, trulyClosed };
    });
    let result = enriched;
    if (filters.status === 'open')   result = enriched.filter((t) => !t.arrivalDate || t.remainingDelay > 0 || t.remainingWeightDiff > 0);
    if (filters.status === 'closed') result = enriched.filter((t) => t.trulyClosed);
    if (filters.pendingBalance)      result = result.filter((t) => t.remainingFreight > 0 || t.remainingDelay > 0 || t.remainingWeightDiff > 0);
    return result;
  }

  async findOne(uid: string) {
    const trip = await this.repo.findByUid(uid);
    if (!trip) throw new NotFoundException('كشف السائق غير موجود');
    return trip;
  }

  async update(uid: string, dto: UpdateDriverTripDto) {
    await this.findOne(uid);
    let partyId: number | null | undefined = undefined;
    if ('partyId' in dto) {
      if (!dto.partyId) {
        partyId = null;
      } else {
        const p = await this.repo.findPartyByUid(dto.partyId);
        partyId = p?.id ?? null;
      }
    }
    return this.repo.update(uid, {
      ...(dto.driverName !== undefined ? { driverName: dto.driverName.trim() } : {}),
      ...(dto.vehicleNo !== undefined ? { vehicleNo: dto.vehicleNo.trim() || null } : {}),
      ...(dto.trailerNo !== undefined ? { trailerNo: dto.trailerNo.trim() || null } : {}),
      ...(dto.clientName !== undefined ? { clientName: dto.clientName.trim() } : {}),
      ...(dto.departureDate !== undefined ? { departureDate: new Date(dto.departureDate) } : {}),
      ...(dto.agreedFreight !== undefined ? { agreedFreight: dto.agreedFreight } : {}),
      ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
      ...(partyId !== undefined ? { partyId } : {}),
    });
  }

  async addPayment(uid: string, dto: AddPaymentDto) {
    const trip = await this.findOne(uid);
    const paymentType = dto.paymentType === 'delay' ? 'delay'
                      : dto.paymentType === 'weightDiff' ? 'weightDiff'
                      : 'freight';
    const payments = (trip as any).payments as Array<{ paymentType: string; amount: number }>;

    if (paymentType === 'freight') {
      const totalFreightPaid = payments.filter((p) => p.paymentType === 'freight').reduce((s, p) => s + p.amount, 0);
      const remaining = trip.agreedFreight - totalFreightPaid;
      if (dto.amount > remaining + 0.001)
        throw new BadRequestException(`المبلغ (${dto.amount}) أكبر من الناولون المتبقي (${remaining})`);
    }

    if (paymentType === 'delay') {
      const totalDelayPaid = payments.filter((p) => p.paymentType === 'delay').reduce((s, p) => s + p.amount, 0);
      const remaining = (trip.delayFee ?? 0) - totalDelayPaid;
      if (dto.amount > remaining + 0.001)
        throw new BadRequestException(`المبلغ (${dto.amount}) أكبر من العطلة المتبقية (${remaining})`);
    }

    if (paymentType === 'weightDiff') {
      const totalWdPaid = payments.filter((p) => p.paymentType === 'weightDiff').reduce((s, p) => s + p.amount, 0);
      const remaining = (trip.weightDiffAmount ?? 0) - totalWdPaid;
      if (dto.amount > remaining + 0.001)
        throw new BadRequestException(`المبلغ (${dto.amount}) أكبر من فرق الوزن المتبقي (${remaining})`);
    }

    let treasury: { id: number } | null = null;
    if (dto.treasuryId) {
      treasury = await this.repo.findTreasuryByUid(dto.treasuryId) as any;
    }

    await this.repo.createPayment({
      tripId: trip.id,
      date: new Date(dto.date),
      amount: dto.amount,
      paymentType,
      note: dto.note?.trim() || null,
    });
    if (treasury) {
      const txType = paymentType === 'delay' ? 'driverDelay' : paymentType === 'weightDiff' ? 'driverWeightDiff' : 'driverFreight';
      const txNote = dto.note?.trim() || (paymentType === 'delay' ? `دفع عطلة (${trip.driverName})` : paymentType === 'weightDiff' ? `دفع فرق وزن (${trip.driverName})` : `دفع ناولون (${trip.driverName})`);
      await this.repo.createTreasuryTx({ date: new Date(dto.date), type: txType, cashOut: dto.amount, treasuryId: treasury.id, note: txNote });
    }

    // Legacy: when paying delay and a weightDiffAmount is bundled, create the weight-diff payment too
    if (paymentType === 'delay' && dto.weightDiffAmount && dto.weightDiffAmount > 0) {
      await this.repo.createPayment({ tripId: trip.id, date: new Date(dto.date), amount: dto.weightDiffAmount, paymentType: 'weightDiff', note: 'فرق وزن' });
      if (treasury) {
        await this.repo.createTreasuryTx({ date: new Date(dto.date), type: 'driverWeightDiff', cashOut: dto.weightDiffAmount, treasuryId: treasury.id, note: `فرق وزن (${trip.driverName})` });
      }
    }

    return this.findOne(uid);
  }

  async deletePayment(uid: string, payUid: string) {
    const pay = await this.repo.findPaymentByUid(payUid);
    if (!pay) throw new NotFoundException('الدفعة غير موجودة');
    await this.repo.deletePayment(payUid);
    return this.findOne(uid);
  }

  async setArrival(uid: string, dto: SetArrivalDto) {
    const trip = await this.findOne(uid);
    if (trip.arrivalDate) throw new BadRequestException('تم تسجيل الوصول مسبقًا');

    const arrival = new Date(dto.arrivalDate);
    const days = daysBetween(trip.departureDate, arrival);
    const cfg = await this.configService.get();
    const delayDays = Math.max(0, days - cfg.delayGraceDays);
    const delayFee = delayDays * cfg.delayFeePerDay;
    const weightDiffAmount = dto.weightDiffAmount ?? 0;

    let delayTxId: number | null = null;
    let weightDiffTxId: number | null = null;

    if (delayFee > 0 && trip.partyId) {
      const tx = await this.repo.createDelayTx({
        date: arrival,
        type: 'truckDelay',
        debit: delayFee,
        partyId: trip.partyId,
        note: `عطلة عربية (${trip.driverName})`,
      });
      delayTxId = tx.id;
    }

    if (weightDiffAmount > 0 && trip.partyId) {
      const tx = await this.repo.createDelayTx({
        date: arrival,
        type: 'truckWeightDiff',
        debit: weightDiffAmount,
        partyId: trip.partyId,
        note: `فرق وزن (${trip.driverName})`,
      });
      weightDiffTxId = tx.id;
    }

    return this.repo.update(uid, {
      arrivalDate: arrival,
      delayFee,
      weightDiffAmount,
      ...(delayTxId ? { delayTxId } : {}),
      ...(weightDiffTxId ? { weightDiffTxId } : {}),
    });
  }

  async updateWeightDiff(uid: string, dto: PatchWeightDiffDto) {
    const trip = await this.findOne(uid) as any;
    if (!trip.arrivalDate) throw new BadRequestException('لم يتم تسجيل الوصول بعد');
    const newAmount = dto.amount;
    const weightDiffTxId: number | null = trip.weightDiffTxId ?? null;

    if (weightDiffTxId) {
      await this.repo.updateTransactionById(weightDiffTxId, newAmount);
    } else if (newAmount > 0 && trip.partyId) {
      const tx = await this.repo.createDelayTx({
        date: trip.arrivalDate,
        type: 'truckWeightDiff',
        debit: newAmount,
        partyId: trip.partyId,
        note: `فرق وزن (${trip.driverName})`,
      });
      return this.repo.update(uid, { weightDiffAmount: newAmount, weightDiffTxId: tx.id });
    }

    return this.repo.update(uid, { weightDiffAmount: newAmount });
  }

  async remove(uid: string) {
    const trip = await this.findOne(uid);
    if (trip.arrivalDate) throw new BadRequestException('لا يمكن حذف رحلة مكتملة');
    return this.repo.remove(uid);
  }
}
