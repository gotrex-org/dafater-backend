import { IsDateString, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

/**
 * مصروف جمارك على عربية — بيترحّل على حساب المخلّص الجاري.
 * المخلّص بيصرف على الجمارك، فالمصروف بيخلّينا مدينين له (credit عنده)،
 * والسداد بعدين بيقلّل الرصيد. معاملته زي الناولون: تكلفة شحن مش تكلفة صنف،
 * فمابيلمسش avgCost ولا قيمة المخزن.
 */
export class AddClearanceExpenseDto {
  @IsString() manifestId: string; // uid كشف العربية
  @IsString() agentId: string;    // uid المخلّص (طرف بدور CLEARANCE)
  @IsDateString() date: string;
  @IsNumber() @IsPositive() amount: number;
  @IsOptional() @IsString() categoryId?: string; // بند المصروف (جمارك / أرضيات / أتعاب…)
  @IsOptional() @IsString() note?: string;
}

/** سداد للمخلّص من خزنة — بيقلّل اللي عليه لنا. */
export class PayClearanceAgentDto {
  @IsString() agentId: string;
  @IsDateString() date: string;
  @IsNumber() @IsPositive() amount: number;
  @IsString() treasuryId: string;
  @IsOptional() @IsString() note?: string;
}

export class ClearanceQueryDto {
  @IsOptional() @IsString() agentId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
