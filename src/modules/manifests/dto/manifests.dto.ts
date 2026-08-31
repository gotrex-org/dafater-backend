import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export class ManifestItemDto {
  @IsString() name: string;
  @IsNumber() qty: number;
}
export class CreateManifestDto {
  @IsOptional() @IsString() no?: string; // auto-numbered sequentially when omitted
  @IsDateString() date: string;
  @IsString() clientName: string;
  @IsOptional() @IsString() invoiceId?: string;
  @IsOptional() @IsString() vehicleNo?: string;
  @IsOptional() @IsString() vehicleLabel?: string; // مسمّى العربية
  @IsOptional() @IsString() trailerNo?: string;
  @IsOptional() @IsString() driverName?: string;
  @IsOptional() @IsString() driverPhone?: string;
  @IsOptional() @IsString() driverNID?: string;
  @IsOptional() @IsString() clearingAgent?: string;
  @IsOptional() @IsString() note?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ManifestItemDto) items: ManifestItemDto[];
}

export class UpdateManifestDto {
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() clientName?: string;
  // ربط العربية بفاتورة (uid) — سلسلة فاضية معناها فك الربط. الربط هو اللي بيخلّي
  // العربية تظهر كتاب جوّه الفاتورة.
  @IsOptional() @IsString() invoiceId?: string;
  @IsOptional() @IsString() vehicleNo?: string;
  @IsOptional() @IsString() vehicleLabel?: string; // مسمّى العربية
  @IsOptional() @IsString() trailerNo?: string;
  @IsOptional() @IsString() driverName?: string;
  @IsOptional() @IsString() driverPhone?: string;
  @IsOptional() @IsString() driverNID?: string;
  @IsOptional() @IsString() clearingAgent?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ManifestItemDto) items?: ManifestItemDto[];
}
