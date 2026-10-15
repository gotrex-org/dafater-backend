import { IsBoolean, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class ChargeTypeDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() hidden?: boolean;
}

export class UpdateChargeTypeDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() hidden?: boolean;
}
