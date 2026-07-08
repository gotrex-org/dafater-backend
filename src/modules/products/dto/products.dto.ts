import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateProductDto {
  @IsString() name: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsBoolean() service?: boolean;
  @IsOptional() @IsBoolean() pinSale?: boolean;
  @IsOptional() @IsBoolean() pinPurchase?: boolean;
  @IsOptional() @IsNumber() @Min(0) price?: number;
}

export class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsBoolean() service?: boolean;
  @IsOptional() @IsBoolean() pinSale?: boolean;
  @IsOptional() @IsBoolean() pinPurchase?: boolean;
  @IsOptional() @IsNumber() @Min(0) price?: number;
}
