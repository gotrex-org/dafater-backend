import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class CategoryDto {
  @IsString() name: string;
  @IsOptional() @IsIn(['WAREHOUSE', 'EXTERNAL']) group?: 'WAREHOUSE' | 'EXTERNAL'; // مصاريف مخزن / مصاريف خارجية
  @IsOptional() @IsBoolean() addsToGoods?: boolean; // يُضاف على البضاعة (ناولون/شاي) بدل تشغيلي
  // النشاط اللي البند بيتحسب عليه — SHARED = مقسّم بنسبة الإعدادات (المرتبات)
  @IsOptional() @IsIn(['TRADE', 'SHIPPING', 'SHARED']) activity?: 'TRADE' | 'SHIPPING' | 'SHARED';
  // البند بيتربط بعربية (تحميل/شفتنة) — خانة اختيارية للعربية في الصرف
  @IsOptional() @IsBoolean() vehicleLink?: boolean;
}
