import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CategoryDto {
  @IsString() name: string;
  @IsOptional() @IsBoolean() addsToGoods?: boolean; // يُضاف على البضاعة (ناولون/شاي) بدل تشغيلي
}
