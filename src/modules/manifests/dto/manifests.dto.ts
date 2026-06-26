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
  @IsOptional() @IsString() vehicleNo?: string;
  @IsOptional() @IsString() trailerNo?: string;
  @IsOptional() @IsString() driverName?: string;
  @IsOptional() @IsString() driverPhone?: string;
  @IsOptional() @IsString() driverNID?: string;
  @IsOptional() @IsString() clearingAgent?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ManifestItemDto) items?: ManifestItemDto[];
}
