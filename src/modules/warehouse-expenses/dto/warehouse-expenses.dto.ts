import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateWarehouseScheduleDto {
  @IsString() warehouseId: string;
  @IsOptional() @IsString() treasuryId?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsString() title: string; // إيجار / مرتبات ...
  @IsNumber() @Min(0) amount: number;
  @IsOptional() @IsInt() @Min(1) @Max(28) dayOfMonth?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
