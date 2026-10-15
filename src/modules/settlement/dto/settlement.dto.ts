import { Type } from 'class-transformer';
import {
  ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, Matches, Min,
  ValidateNested,
} from 'class-validator';

/**
 * تاريخ يوم فقط. `@IsISO8601` كانت تقبل وقتاً أيضاً، فتمر فترتان بنفس اليوم
 * وساعات مختلفة على قيد الـ unique، وتُسعَّر فواتير اليوم من قائمتين مختلفتين.
 * الصيغة ثابتة هنا، والخدمة تطبّعها إلى منتصف ليل UTC.
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class PartnerUpsertDto {
  @IsOptional() @IsString() name?: string;
  /** CAPITAL = برأس المال · FIXED = تصفية ثابتة (مبلغ للوحدة) */
  @IsOptional() @IsIn(['CAPITAL', 'FIXED']) shareBasis?: 'CAPITAL' | 'FIXED';
  /** برأس المال: رأس ماله الافتتاحي بالجنيه */
  @IsOptional() @IsNumber() @Min(0) capital?: number;
  /** برأس المال: مصروف التشغيل للكرتونة */
  @IsOptional() @IsNumber() @Min(0) cartonExpense?: number;
  /** uids موردي الشريك. قائمة فارغة = لا يوجد مورد، فلا أصناف تُحسب. */
  @IsOptional() @IsArray() @IsString({ each: true }) supplierIds?: string[];
  /** uid حساب الشريك — صاحبه يرى هذه التصفية فقط */
  @IsOptional() @IsString() userId?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() note?: string;
}

/**
 * إضافة أو نقص رأس مال على القديم. المبلغ الموجب إضافة والسالب نقص، ولذلك
 * بدون `@Min` — والقيمة صفر مرفوضة في الخدمة.
 */
export class CapitalMovementDto {
  @Matches(DAY, { message: 'يجب أن يكون التاريخ بصيغة YYYY-MM-DD' })
  date: string;
  @IsNumber() amount: number;
  @IsOptional() @IsString() note?: string;
}

/** التصفية الثابتة: المبلغ للوحدة على فاتورة شراء مختارة. */
export class FixedRateDto {
  @IsNumber() @Min(0) rate: number;
}

/** دفعة تسلّمها الاسم من مستحقه — تنزل في كشف حسابه. */
export class PartnerPaymentDto {
  @Matches(DAY, { message: 'يجب أن يكون التاريخ بصيغة YYYY-MM-DD' })
  date: string;
  @IsNumber() @Min(0) amount: number;
  @IsOptional() @IsString() note?: string;
}

export class CreatePartnerDto extends PartnerUpsertDto {
  @IsString() name: string;
}

/** سطر واحد في قايمة أسعار الأسبوع: الصنف وسعر شرائه من المورد. */
export class PriceListItemDto {
  @IsString() productId: string;
  @IsNumber() @Min(0) price: number;
}

export class CreatePriceListDto {
  /** المورد اللي القايمة دي ليه — مطلوب لو الاسم مربوط بأكتر من مورد */
  @IsOptional() @IsString() supplierId?: string;

  @Matches(DAY, { message: 'يجب أن يكون تاريخ البداية بصيغة YYYY-MM-DD' })
  weekStart: string;

  @Matches(DAY, { message: 'يجب أن يكون تاريخ النهاية بصيغة YYYY-MM-DD' })
  weekEnd: string;
  @IsOptional() @IsString() note?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PriceListItemDto)
  items: PriceListItemDto[];
}

/**
 * تعديل قايمة. `items` بتـ upsert الأصناف المبعوتة بس ومابتمسحش الباقي —
 * عشان تعديل سعر صنف ما يضيفش أسعار لأصناف كانت مستبعدة بالقصد.
 * `removeProductIds` بتشيل أصناف صريحة.
 */
export class UpdatePriceListDto {
  @IsOptional() @Matches(DAY, { message: 'يجب أن يكون تاريخ البداية بصيغة YYYY-MM-DD' })
  weekStart?: string;

  @IsOptional() @Matches(DAY, { message: 'يجب أن يكون تاريخ النهاية بصيغة YYYY-MM-DD' })
  weekEnd?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PriceListItemDto)
  items?: PriceListItemDto[];
  @IsOptional() @IsArray() @IsString({ each: true }) removeProductIds?: string[];
}

/**
 * تعليم فواتير معيّنة كداخلة في تصفية الاسم: فواتير بيع برأس المال، وفواتير
 * شراء بالتصفية الثابتة.
 */
export class SelectInvoicesDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) invoiceIds: string[];
}

/** تعديل عربية متعلّم عليها: عدد الكراتين وملاحظة. */
export class UpdatePartnerVehicleDto {
  /** null = ارجع لمجموع كميات أصناف المورد */
  @IsOptional() @IsNumber() @Min(0) cartons?: number | null;
  @IsOptional() @IsString() note?: string;
}

/** فرض أسبوع على صنف في فاتورة (لما الدفع يتقسم على أسبوعين). */
export class SetItemWeekDto {
  @IsString() productId: string;
  /** null = ارجع لقايمة أسبوع تاريخ الفاتورة */
  @IsOptional() @IsString() priceListId?: string | null;
}
