import { IsDateString, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateDriverAdvanceDto {
  @IsString() driverName: string;
  @IsDateString() date: string;
  @IsNumber() @IsPositive() amount: number;
  @IsString() treasuryId: string;
  @IsOptional() @IsString() note?: string;
}

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
