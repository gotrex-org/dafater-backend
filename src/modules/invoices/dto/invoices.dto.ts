import { Type } from 'class-transformer';
import {
  IsArray, IsEnum, IsNumber, IsOptional, IsString, ValidateNested, IsDateString,
} from 'class-validator';
import { InvoiceKind } from '@prisma/client';

export class InvoiceItemDto {
  @IsString() productId: string;
  @IsNumber() qty: number;
  @IsNumber() price: number;
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
  @IsOptional() @IsString() treasuryId?: string;
  @IsOptional() @IsString() note?: string;

  // purchase only — commission is credited to the chosen agent party's ledger
  @IsOptional() @IsNumber() commissionAmount?: number;
  @IsOptional() @IsString() commissionPartyId?: string;
}
