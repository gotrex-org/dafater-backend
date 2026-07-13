import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export class CreateAdjustmentDto {
  @IsDateString() date: string;
  @IsString() warehouseId: string;
  @IsString() productId: string;
  @IsNumber() qty: number; // net change (+/-)
  @IsOptional() @IsString() note?: string;
}

export class TransferItemDto {
  @IsString() productId: string;
  @IsNumber() qty: number;
}

// تحويل بين المخازن — moves quantities from one warehouse to another (stock only).
export class TransferStockDto {
  @IsDateString() date: string;
  @IsString() fromWarehouseId: string;
  @IsString() toWarehouseId: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => TransferItemDto)
  items: TransferItemDto[];
  @IsOptional() @IsString() note?: string;
}
