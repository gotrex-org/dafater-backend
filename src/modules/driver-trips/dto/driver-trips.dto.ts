import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class CreateDriverTripDto {
  @IsOptional() @IsString() manifestId?: string;
  @IsOptional() @IsString() partyId?: string;
  @IsString() driverName: string;
  @IsOptional() @IsString() vehicleNo?: string;
  @IsOptional() @IsString() trailerNo?: string;
  @IsOptional() @IsString() clientName?: string;
  @IsDateString() departureDate: string;
  @IsNumber() @Min(0) agreedFreight: number;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsNumber() @Min(0) initialPaid?: number;
  @IsOptional() @IsString() initialPaidNote?: string;
  @IsOptional() @IsNumber() @Min(0) teaMoney?: number;
  @IsOptional() @IsString() teaTreasuryId?: string;
}

export class UpdateDriverTripDto {
  @IsOptional() @IsString() partyId?: string;
  @IsOptional() @IsString() driverName?: string;
  @IsOptional() @IsString() vehicleNo?: string;
  @IsOptional() @IsString() trailerNo?: string;
  @IsOptional() @IsString() clientName?: string;
  @IsOptional() @IsDateString() departureDate?: string;
  @IsOptional() @IsNumber() @Min(0) agreedFreight?: number;
  @IsOptional() @IsString() note?: string;
}

export class AddPaymentDto {
  @IsDateString() date: string;
  @IsNumber() @IsPositive() amount: number;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() paymentType?: string;
  @IsOptional() @IsString() treasuryId?: string;
  @IsOptional() @IsNumber() @Min(0) weightDiffAmount?: number;
}

export class SetArrivalDto {
  @IsDateString() arrivalDate: string;
}
