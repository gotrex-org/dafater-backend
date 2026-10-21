import { IsBoolean, IsDateString, IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

/**
 * مصروف جمارك وتخليص على عربية — بيترحّل على حساب مكتب التخليص الجاري.
 * المكتب بيصرف على الجمارك، فالمصروف بيخلّينا مدينين له (credit عنده)،
 * والسداد بعدين بيقلّل الرصيد. تكلفة شحن مش تكلفة صنف، فمابيلمسش avgCost
 * ولا قيمة المخزن.
 */
export class AddClearanceExpenseDto {
  @IsString() manifestId: string; // uid كشف العربية
  @IsString() agentId: string;    // uid مكتب التخليص (طرف بدور CLEARANCE)
  @IsDateString() date: string;
  @IsNumber() @IsPositive() amount: number;
  @IsOptional() @IsString() categoryId?: string; // بند المصروف (جمارك / أرضيات / أتعاب…)
  @IsOptional() @IsString() note?: string;
}

/**
 * دفعة لمكتب التخليص من خزنة (جنيه أو دولار) — بتقلّل رصيده. الدفعة من خزنة دولار
 * محتاجة سعر الصرف: الخزنة بتنقص بالدولار، وحساب المكتب بينزل بالمقابل بالجنيه.
 */
export class PayClearanceAgentDto {
  @IsString() agentId: string;
  @IsDateString() date: string;
  @IsNumber() @IsPositive() amount: number; // بعملة الخزنة
  @IsString() treasuryId: string;
  @IsOptional() @IsNumber() @IsPositive() rate?: number; // جنيه لكل دولار — لخزنة الدولار
  @IsOptional() @IsString() note?: string;
}

export class ClearanceQueryDto {
  @IsOptional() @IsString() agentId?: string;
  @IsOptional() @IsString() archived?: string; // '1' = المكاتب المؤرشفة كمان
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class ClearanceAgentDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() supplierId?: string; // uid مورد تُرحَّل عليه حركات المكتب
}

export class UpdateClearanceAgentDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() supplierId?: string; // سلسلة فاضية = فك الربط
}

/**
 * تخليص نقدي على عربية — المبلغ بيتدفع من الخزنة على طول. بيتسجّل كمصروف على حساب
 * المكتب + دفعة له في نفس اللحظة (رجلين مربوطين بـ groupId)، فرصيد المكتب مابيتغيّرش
 * والعربية بتشيل التكلفة.
 */
export class AddCashClearanceDto extends AddClearanceExpenseDto {
  @IsString() treasuryId: string;
  @IsOptional() @IsNumber() @IsPositive() rate?: number; // جنيه لكل دولار — لخزنة الدولار
}

/** تعديل حركة تخليص (أو التخليص النقدي برجليه). أي حقل مش مبعوت بيفضل زي ما هو. */
export class UpdateClearanceMovementDto {
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsNumber() @IsPositive() amount?: number;
  @IsOptional() @IsString() agentId?: string;
  @IsOptional() @IsString() manifestId?: string;
  @IsOptional() @IsString() treasuryId?: string;
  @IsOptional() @IsNumber() @IsPositive() rate?: number;
  @IsOptional() @IsString() categoryId?: string; // سلسلة فاضية = من غير بند
  @IsOptional() @IsString() note?: string;
}

export class ClearanceAgentsQueryDto {
  @IsOptional() @IsString() archived?: string; // '1' = هات المؤرشفة كمان
}

export class ArchiveClearanceAgentDto {
  @IsBoolean() archived: boolean;
}
