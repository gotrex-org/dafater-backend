import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateAdjustmentDto {
  @IsDateString() date: string;
  @IsString() warehouseId: string;
  @IsString() productId: string;
  @IsNumber() qty: number; // net change (+/-)
  @IsOptional() @IsString() note?: string;
}
