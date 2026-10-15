import { IsEmail, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateConfigDto {
  @IsOptional() @IsEmail() orderEmail?: string;
  @IsOptional() @IsInt() @Min(0) delayGraceDays?: number;
  @IsOptional() @IsNumber() @Min(0) delayFeePerDay?: number;
  // نصيب الشحن % من المصاريف المشتركة (المرتبات)
  @IsOptional() @IsNumber() @Min(0) @Max(100) salaryShippingPct?: number;
}
