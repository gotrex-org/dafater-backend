import { Injectable } from '@nestjs/common';
import { CreateWarehouseScheduleDto } from './dto/warehouse-expenses.dto';
import { WarehouseExpensesRepository } from './warehouse-expenses.repository';

@Injectable()
export class WarehouseExpensesService {
  constructor(private repo: WarehouseExpensesRepository) {}

  // Apply due recurring expenses lazily on read (no cron needed).
  async listSchedules() {
    await this.repo.processDue().catch(() => undefined);
    return this.repo.listSchedules();
  }

  async createSchedule(dto: CreateWarehouseScheduleDto) {
    const s = await this.repo.createSchedule(dto);
    await this.repo.processDue().catch(() => undefined); // apply immediately if already due
    return s;
  }

  removeSchedule(uid: string) { return this.repo.removeSchedule(uid); }
}
