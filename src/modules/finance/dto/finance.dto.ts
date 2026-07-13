import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { OwnerEntryKind } from '@prisma/client';

export class CreateOwnerEntryDto {
  @IsEnum(OwnerEntryKind) kind: OwnerEntryKind;
  @IsString() title: string;
  @IsNumber() amount: number;
  @IsOptional() @IsNumber() discount?: number; // خصم من الشركات
  @IsDateString() date: string;
  @IsOptional() @IsString() note?: string;
}

export class UpdateOwnerEntryDto {
  @IsOptional() @IsEnum(OwnerEntryKind) kind?: OwnerEntryKind;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsNumber() discount?: number;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() note?: string;
}
