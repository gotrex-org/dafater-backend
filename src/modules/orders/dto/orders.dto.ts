import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export class OrderItemDto {
  @IsString() name: string;
  @IsNumber() qty: number;
}

export class CreateOrderDto {
  @IsString() name: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() note?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => OrderItemDto) items: OrderItemDto[];
}

export class UpdateOrderDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OrderItemDto) items?: OrderItemDto[];
}

export class ReceiveItemDto {
  @IsString() id: string;
  @IsNumber() received: number;
}

export class ReceiveOrderDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReceiveItemDto) items: ReceiveItemDto[];
}
