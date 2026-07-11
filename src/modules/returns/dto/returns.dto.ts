import { Type } from 'class-transformer';
import {
  IsArray, IsEnum, IsNumber, IsOptional, IsString, ValidateNested, IsDateString,
} from 'class-validator';
import { InvoiceKind } from '@prisma/client';

export class ReturnItemDto {
  @IsString() productId: string;
  @IsNumber() qty: number;
  @IsNumber() price: number;
}

export class CreateReturnDto {
  // SALE = مرتجع بيع (عميل رجّع بضاعة) · PURCHASE = مرتجع شراء (رجّعنا للمورد)
  @IsEnum(InvoiceKind) kind: InvoiceKind;
  @IsOptional() @IsString() no?: string; // auto-numbered per party when omitted
  @IsDateString() date: string;
  @IsString() partyId: string;
  @IsString() warehouseId: string;
  // Optional original invoice this return came from (validated against it if present).
  @IsOptional() @IsString() invoiceId?: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => ReturnItemDto)
  items: ReturnItemDto[];

  // Optional cash refunded (SALE) / received back (PURCHASE) and the treasury it moves through.
  @IsOptional() @IsNumber() refund?: number;
  @IsOptional() @IsString() treasuryId?: string;
  @IsOptional() @IsString() note?: string;
}
