import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { PartyRole, PartyType, Currency } from '@prisma/client';

export class CreatePartyDto {
  @IsString() name: string;
  @IsEnum(PartyRole) role: PartyRole;
  @IsOptional() @IsEnum(PartyType) type?: PartyType;
  @IsOptional() @IsEnum(Currency) currency?: Currency;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsNumber() opening?: number;
  @IsOptional() @IsBoolean() hidden?: boolean;
}

export class UpdatePartyDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(PartyRole) role?: PartyRole;
  @IsOptional() @IsEnum(PartyType) type?: PartyType;
  @IsOptional() @IsEnum(Currency) currency?: Currency;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsNumber() opening?: number;
  @IsOptional() @IsBoolean() hidden?: boolean;
}
