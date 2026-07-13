import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { DiscountRecurrence } from '@prisma/client';

export class CreateDiscountDto {
  @IsDateString() date: string;
  @IsString() partyId: string;
  @IsNumber() amount: number;
  @IsOptional() @IsString() note?: string;
}

export class CreateDiscountScheduleDto {
  @IsString() partyId: string;
  @IsOptional() @IsNumber() amount?: number; // مبلغ ثابت
  @IsOptional() @IsNumber() percent?: number; // نسبة % من مشتريات الفترة
  @IsEnum(DiscountRecurrence) recurrence: DiscountRecurrence;
  @IsDateString() startDate: string;
  @IsOptional() @IsString() note?: string;
}
