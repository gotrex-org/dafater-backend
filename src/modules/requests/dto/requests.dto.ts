import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export class RequestItemDto {
  @IsString() name: string;
  @IsNumber() qty: number;
}
export class CreateRequestDto {
  @IsDateString() date: string;
  @IsString() clientId: string;
  @IsOptional() @IsString() note?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => RequestItemDto) items: RequestItemDto[];
}

export class ReceiveItemDto {
  @IsString() id: string; // RequestItem uid
  @IsNumber() received: number;
}
export class ReceiveDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReceiveItemDto) items: ReceiveItemDto[];
}
