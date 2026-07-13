import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { DiscountRecurrence } from '@prisma/client';

export class CreateDiscountDto {
  @IsDateString() date: string;
  @IsString() partyId: string;
  // Cash amount. If percent/cartons are given instead, the amount is computed server-side.
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsNumber() percent?: number; // % من مشتريات الشهر الحالي من الطرف
  @IsOptional() @IsNumber() cartons?: number; // عدد كراتين
  @IsOptional() @IsNumber() cartonPrice?: number; // سعر الكرتونة
  @IsOptional() @IsString() note?: string;
}

export class CreateDiscountScheduleDto {
  @IsString() partyId: string;
  @IsOptional() @IsNumber() amount?: number; // مبلغ ثابت
  @IsOptional() @IsNumber() percent?: number; // نسبة % من مشتريات الفترة
  @IsOptional() @IsNumber() cartons?: number; // عدد كراتين
  @IsOptional() @IsNumber() cartonPrice?: number; // سعر الكرتونة
  @IsEnum(DiscountRecurrence) recurrence: DiscountRecurrence;
  @IsDateString() startDate: string;
  @IsOptional() @IsString() note?: string;
}
