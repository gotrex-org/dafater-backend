import { Injectable } from '@nestjs/common';
import { CreateWarehouseScheduleDto } from './dto/warehouse-expenses.dto';
import { WarehouseExpensesRepository } from './warehouse-expenses.repository';

@Injectable()
export class WarehouseExpensesService {
  constructor(private repo: WarehouseExpensesRepository) {}

  async listSchedules() {
    await this.repo.processDue().catch(() => undefined);
    return this.repo.listSchedules();
  }

  async createSchedule(dto: CreateWarehouseScheduleDto) {
    const s = await this.repo.createSchedule(dto);
    await this.repo.processDue().catch(() => undefined); // generate this month's due immediately
    return s;
  }

  removeSchedule(uid: string) { return this.repo.removeSchedule(uid); }

  // ── الاستحقاقات (dues) — تظهر في التذكيرات لحد ما يتأكّد عليها ──
  async listDues() {
    await this.repo.processDue().catch(() => undefined);
    return this.repo.listOpenDues();
  }

  async dueCount() {
    await this.repo.processDue().catch(() => undefined);
    return { count: await this.repo.countOpenDues() };
  }

  payDue(uid: string, treasuryId: string, createdById?: number) {
    return this.repo.payDue(uid, treasuryId, createdById);
  }
}
