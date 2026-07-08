import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export enum EntryType {
  COLLECT = 'collect', // تحصيل من عميل
  PAY_SUPPLIER = 'paySupplier', // دفع لمورد
  EXPENSE = 'expense', // مصروف
  TRANSFER = 'transfer', // تحويل بين الخزائن / تحويل عملة
  ADJUST = 'adjust', // تسوية حساب
  UNKNOWN_COLLECT = 'unknownCollect', // تحصيل مجهول (صاحبه غير معروف بعد)
  DEPOSIT = 'deposit', // إيداع رصيد في خزنة
  WITHDRAW = 'withdraw', // سحب رصيد من خزنة
  PARTY_TRANSFER = 'partyTransfer', // تحويل رصيد من طرف لطرف تاني
}

export class ResolveDto {
  @IsString() partyId: string;
  @IsOptional() @IsNumber() transferFee?: number; // رسوم نقل تُضاف وقت الترحيل لو ماتعملتش وقت التحصيل
}

export class PostEntryDto {
  @IsEnum(EntryType) type: EntryType;
  @IsDateString() date: string;
  @IsNumber() amount: number;

  @IsOptional() @IsString() partyId?: string;
  @IsOptional() @IsString() partyId2?: string; // الطرف المستلم في التحويل بين الأطراف
  @IsOptional() @IsString() treasuryId?: string;
  @IsOptional() @IsString() treasuryId2?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsNumber() rate?: number; // exchange rate (EGP per USD)
  @IsOptional() @IsNumber() amount2?: number; // received amount on currency transfer
  @IsOptional() @IsString() direction?: 'debit' | 'credit'; // for adjust
  @IsOptional() @IsNumber() transferFee?: number; // رسوم نقل النقدية — تُسجّل على العميل (عليه)
  @IsOptional() @IsString() note?: string;
}

export class UpdateTransactionDto {
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() partyId?: string;
  @IsOptional() @IsString() treasuryId?: string;
}
