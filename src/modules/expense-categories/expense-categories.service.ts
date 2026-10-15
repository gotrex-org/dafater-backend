import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CategoryDto } from './dto/expense-categories.dto';
import { ExpenseCategoriesRepository } from './expense-categories.repository';

@Injectable()
export class ExpenseCategoriesService {
  constructor(private repo: ExpenseCategoriesRepository) {}

  findAll(q: PaginationQueryDto) { return this.repo.findAll(q); }

  // بند مصاريف مخزن جديد من غير نشاط محدد بيتحسب على الشحن — زي باقي مصاريف المخزن.
  // بند مؤرشف بنفس الاسم بيرجع نشط بالإعدادات الجديدة بدل ما يتكرر.
  async create(dto: CategoryDto) {
    const name = dto.name.trim();
    const activity = dto.activity ?? ((dto.group ?? 'WAREHOUSE') === 'WAREHOUSE' ? 'SHIPPING' : 'TRADE');
    const existing = await this.repo.findByName(name);
    if (existing && !existing.hidden) throw new ConflictException('يوجد بند بنفس الاسم');
    if (existing) return this.repo.restore(existing.id, { ...dto, name, activity });
    return this.repo.create({ ...dto, name, activity });
  }

  update(id: string, dto: CategoryDto) { return this.repo.update(id, dto); }

  /** حذف — البند المستخدم في حركات أو مصاريف ثابتة يتأرشف بدل الحذف. */
  async remove(id: string) {
    const u = await this.repo.usage(id);
    if (!u) throw new NotFoundException('البند غير موجود');
    if (u.used) {
      await this.repo.archive(u.id);
      return { ok: true, archived: true };
    }
    await this.repo.remove(id);
    return { ok: true, archived: false };
  }
}
