import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateWarehouseScheduleDto {
  @IsOptional() @IsString() warehouseId?: string; // اختياري — على الشركة عمومًا
  @IsOptional() @IsString() categoryId?: string;
  @IsString() title: string; // إيجار / مرتبات ...
  @IsNumber() @Min(0) amount: number;
  @IsOptional() @IsInt() @Min(1) @Max(28) dayOfMonth?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

// تأكيد دفع بند مستحق — لازم نختار الخزينة اللي هيتخصم منها وقت الدفع الفعلي.
export class PayDueDto {
  @IsString() treasuryId: string;
}
