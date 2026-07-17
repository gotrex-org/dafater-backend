import { IsArray, IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export enum EntryType {
  COLLECT = 'collect', // تحصيل من عميل
  PAY_SUPPLIER = 'paySupplier', // دفع لمورد
  EXPENSE = 'expense', // مصروف (قديم)
  CASH = 'cash', // صرف وتوريد نقدية (موحّد بجهة)
  TRANSFER = 'transfer', // تحويل بين الخزائن / تحويل عملة
  ADJUST = 'adjust', // تسوية حساب
  UNKNOWN_COLLECT = 'unknownCollect', // تحصيل مجهول (صاحبه غير معروف بعد)
  DEPOSIT = 'deposit', // إيداع رصيد في خزنة
  WITHDRAW = 'withdraw', // سحب رصيد من خزنة
  PARTY_TRANSFER = 'partyTransfer', // تحويل رصيد من طرف لطرف تاني
}

export type CashDir = 'out' | 'in'; // صرف / توريد
export type CashTarget = 'client' | 'supplier' | 'warehouse' | 'external' | 'goods' | 'settlement' | 'account' | 'custody';
export type GoodsMode = 'invoices' | 'products' | 'count'; // توزيع صرف البضاعة
export interface GoodsItem { productId: string; count?: number }

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
  @IsOptional() @IsString() warehouseId?: string; // مصروف مخزن
  @IsOptional() @IsIn(['out', 'in']) cashDir?: CashDir;
  @IsOptional() @IsIn(['client', 'supplier', 'warehouse', 'external', 'goods', 'settlement', 'account', 'custody']) cashTarget?: CashTarget;
  @IsOptional() @IsString() holderName?: string; // اسم صاحب العهدة (لو مش طرف موجود)
  // توزيع صرف البضاعة على تكلفة الأصناف (يرفع صافي السعر زي الناولون)
  @IsOptional() @IsIn(['invoices', 'products', 'count']) goodsMode?: GoodsMode;
  @IsOptional() @IsArray() invoiceIds?: string[];
  @IsOptional() @IsArray() goodsItems?: GoodsItem[];
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
