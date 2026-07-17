import { Type } from 'class-transformer';
import {
  IsArray, IsDateString, IsNumber, IsOptional, IsString, ValidateNested,
} from 'class-validator';

export class DealItemDto {
  @IsString() productId: string;
  @IsNumber() qty: number;
  @IsNumber() price: number; // sell price (to client)
  @IsOptional() @IsNumber() buyPrice?: number; // buy price (from supplier)
  // تكاليف إضافية على البند — زي الفواتير (ناولون خارجي/شاي/عمولة بخزنة وبيان)
  @IsOptional() @IsNumber() freight?: number;
  @IsOptional() @IsString() freightTreasuryId?: string;
  @IsOptional() @IsString() freightNote?: string;
  @IsOptional() @IsNumber() tea?: number;
  @IsOptional() @IsString() teaTreasuryId?: string;
  @IsOptional() @IsString() teaNote?: string;
  @IsOptional() @IsNumber() commissionQty?: number;
  @IsOptional() @IsNumber() commissionPrice?: number;
  @IsOptional() @IsString() commissionPartyId?: string;
}
export class CreateDealDto {
  @IsOptional() @IsString() no?: string; // auto-numbered when omitted
  @IsDateString() date: string;
  @IsString() clientId: string;
  @IsString() supplierId: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => DealItemDto) items: DealItemDto[];
  @IsOptional() @IsNumber() paidIn?: number;
  @IsOptional() @IsNumber() paidOut?: number;
  @IsOptional() @IsString() treasuryId?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsNumber() commissionAmount?: number;
  @IsOptional() @IsString() commissionPartyId?: string;
  @IsOptional() @IsNumber() nawlon?: number;
}

export class DealCommissionDto {
  @IsOptional() @IsNumber() commissionAmount?: number;
  @IsOptional() @IsString() commissionPartyId?: string;
}
