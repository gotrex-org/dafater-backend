import { IsOptional, IsString } from 'class-validator';

export class CreateDriverDto {
  @IsString() name: string;
  @IsOptional() @IsString() nationalId?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() phone2?: string;
  @IsOptional() @IsString() vehicleNo?: string;
  @IsOptional() @IsString() trailerNo?: string;
  @IsOptional() @IsString() note?: string;
}

export class UpdateDriverDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() nationalId?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() phone2?: string;
  @IsOptional() @IsString() vehicleNo?: string;
  @IsOptional() @IsString() trailerNo?: string;
  @IsOptional() @IsString() note?: string;
}
