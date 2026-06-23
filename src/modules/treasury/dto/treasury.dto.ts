import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Currency } from '@prisma/client';

export class TreasuryDto {
  @IsString() name: string;
  @IsOptional() @IsEnum(Currency) currency?: Currency;
  @IsOptional() @IsNumber() opening?: number;
}
