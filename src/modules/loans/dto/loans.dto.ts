import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class CreateLoanDto {
  @IsDateString() date: string;
  @IsOptional() @IsString() partyId?: string;      // uid — link to party
  @IsOptional() @IsString() borrowerName?: string;  // fallback if no party
  @IsString() productId: string;
  @IsString() warehouseId: string;
  @IsNumber() @IsPositive() qty: number;
  @IsOptional() @IsString() note?: string;
}

export class ReturnLoanDto {
  @IsDateString() returnDate: string;
  @IsString() @IsIn(['GOODS', 'CASH', 'DEBT']) returnType: string;
  @IsNumber() @IsPositive() returnedQty: number;
  @IsOptional() @IsNumber() @Min(0) pricePerUnit?: number; // for CASH and DEBT
  @IsOptional() @IsString() treasuryId?: string;   // for CASH
  @IsOptional() @IsString() debtPartyId?: string;  // for DEBT if loan has no partyId
  @IsOptional() @IsString() returnNote?: string;
}
