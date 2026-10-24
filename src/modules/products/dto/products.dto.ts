import { ArrayMinSize, IsArray, IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateProductDto {
  @IsString() name: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsBoolean() service?: boolean;
  @IsOptional() @IsBoolean() pinSale?: boolean;
  @IsOptional() @IsBoolean() pinPurchase?: boolean;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsNumber() @Min(0) purchasePrice?: number;
  @IsOptional() @IsNumber() @Min(0) salePrice?: number;
}

export class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsBoolean() service?: boolean;
  @IsOptional() @IsBoolean() pinSale?: boolean;
  @IsOptional() @IsBoolean() pinPurchase?: boolean;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsNumber() @Min(0) purchasePrice?: number;
  @IsOptional() @IsNumber() @Min(0) salePrice?: number;
}

/** دمج أصناف: كل حركات `sourceIds` تنتقل إلى `targetId`، ثم تُحذف الأصناف المدموجة. */
export class MergeProductsDto {
  @IsString() targetId: string;
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) sourceIds: string[];
}
