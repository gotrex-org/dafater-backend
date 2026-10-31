import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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

export class SettleDto {
  @IsDateString() date: string;
  @IsNumber() @Min(0.01) egpAmount: number;
  @IsIn(['in', 'out']) direction: 'in' | 'out'; // in = they pay us back; out = we pay them
  @IsOptional() @IsString() treasuryId?: string;
  @IsOptional() @IsString() note?: string;
}

// تعديل حركة وكيل (أي نوع). الحقول غير الخاصة بنوع الحركة تُتجاهل.
export class UpdateAgentTxDto {
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsNumber() @Min(0.01) egpAmount?: number;        // EGP_IN / SETTLE
  @IsOptional() @IsIn(['in', 'out']) direction?: 'in' | 'out';    // SETTLE
  @IsOptional() @IsString() treasuryId?: string;                  // EGP_IN / SETTLE
  @IsOptional() @IsNumber() @Min(0.01) usdAmount?: number;        // USD_OUT
  @IsOptional() @IsNumber() @Min(0.01) exchangeRate?: number;     // USD_OUT
  @IsOptional() @IsString() partyId?: string;                     // USD_OUT
  @IsOptional() @IsString() note?: string;                        // '' = حذف الملاحظة
}
