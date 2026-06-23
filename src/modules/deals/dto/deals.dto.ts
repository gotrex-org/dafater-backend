import { Type } from 'class-transformer';
import {
  IsArray, IsDateString, IsNumber, IsOptional, IsString, ValidateNested,
} from 'class-validator';

export class DealItemDto {
  @IsString() productId: string;
  @IsNumber() qty: number;
  @IsNumber() price: number; // sell price (to client)
  @IsOptional() @IsNumber() buyPrice?: number; // buy price (from supplier)
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
}
