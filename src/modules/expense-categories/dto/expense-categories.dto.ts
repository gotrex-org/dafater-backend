import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class CategoryDto {
  @IsString() name: string;
  @IsOptional() @IsIn(['WAREHOUSE', 'EXTERNAL']) group?: 'WAREHOUSE' | 'EXTERNAL'; // مصاريف مخزن / مصاريف خارجية
  @IsOptional() @IsBoolean() addsToGoods?: boolean; // يُضاف على البضاعة (ناولون/شاي) بدل تشغيلي
}
