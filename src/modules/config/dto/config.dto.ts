import { IsEmail, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateConfigDto {
  @IsOptional() @IsEmail() orderEmail?: string;
  @IsOptional() @IsInt() @Min(0) delayGraceDays?: number;
  @IsOptional() @IsNumber() @Min(0) delayFeePerDay?: number;
}
