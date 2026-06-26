import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateAgentDto {
  @IsString() name: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() note?: string;
}

export class UpdateAgentDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() note?: string;
}

export class EgpInDto {
  @IsDateString() date: string;
  @IsNumber() @Min(0.01) egpAmount: number;
  @IsOptional() @IsString() treasuryId?: string;
  @IsOptional() @IsString() note?: string;
}

export class UsdOutDto {
  @IsDateString() date: string;
  @IsNumber() @Min(0.01) usdAmount: number;
  @IsNumber() @Min(0.01) exchangeRate: number;
  @IsString() partyId: string;
  @IsOptional() @IsString() note?: string;
}
