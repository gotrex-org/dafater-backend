import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString, ValidateNested, IsDateString,
} from 'class-validator';
import { InvoiceKind } from '@prisma/client';

export class InvoiceItemDto {
  @IsString() productId: string;
  @IsNumber() qty: number;
  @IsNumber() price: number;
  @IsOptional() @IsNumber() freight?: number; // ناولون — يُدفع من خزينة مختارة ويُضاف للتكلفة
  @IsOptional() @IsString() freightTreasuryId?: string;
  @IsOptional() @IsString() freightNote?: string;
  @IsOptional() @IsNumber() tea?: number;     // شاي — يُدفع من خزينة مختارة ويُضاف للتكلفة
  @IsOptional() @IsString() teaTreasuryId?: string;
  @IsOptional() @IsString() teaNote?: string;
  // عمولة البند = عدد × سعر، تترحّل لحساب صاحبها (commissionPartyId)
  @IsOptional() @IsNumber() commissionQty?: number;
  @IsOptional() @IsNumber() commissionPrice?: number;
  @IsOptional() @IsString() commissionPartyId?: string;
}

export class CreateInvoiceDto {
  @IsEnum(InvoiceKind) kind: InvoiceKind;
  @IsOptional() @IsString() no?: string; // auto-numbered per kind when omitted
  @IsDateString() date: string;
  @IsString() partyId: string;
  @IsString() warehouseId: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  @IsOptional() @IsNumber() paid?: number;
  @IsOptional() @IsNumber() discount?: number;
  @IsOptional() @IsBoolean() fake?: boolean;
  @IsOptional() @IsString() treasuryId?: string;
  @IsOptional() @IsString() note?: string;
  // EGP-per-USD rate for a dollar (USD) invoice; omitted for EGP invoices
  @IsOptional() @IsNumber() exchangeRate?: number;

  // purchase only — commission is credited to the chosen agent party's ledger
  @IsOptional() @IsNumber() commissionAmount?: number;
  @IsOptional() @IsString() commissionPartyId?: string;
}

export class UpdateInvoiceDto {
  @IsDateString() date: string;
  @IsString() partyId: string;
  @IsString() warehouseId: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  @IsOptional() @IsNumber() paid?: number;
  @IsOptional() @IsNumber() discount?: number;
  @IsOptional() @IsBoolean() fake?: boolean;
  @IsOptional() @IsString() treasuryId?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsNumber() exchangeRate?: number;

  @IsOptional() @IsNumber() commissionAmount?: number;
  @IsOptional() @IsString() commissionPartyId?: string;
}

export class CommissionDto {
  @IsOptional() @IsNumber() commissionAmount?: number;
  @IsOptional() @IsString() commissionPartyId?: string;
}
