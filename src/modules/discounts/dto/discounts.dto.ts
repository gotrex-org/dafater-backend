import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateDiscountDto {
  @IsDateString() date: string;
  @IsString() partyId: string;
  @IsNumber() amount: number;
  @IsOptional() @IsString() note?: string;
}
