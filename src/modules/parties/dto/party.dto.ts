import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { PartyRole, PartyType } from '@prisma/client';

export class CreatePartyDto {
  @IsString() name: string;
  @IsEnum(PartyRole) role: PartyRole;
  @IsOptional() @IsEnum(PartyType) type?: PartyType;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsNumber() opening?: number;
  @IsOptional() @IsBoolean() hidden?: boolean;
}

export class UpdatePartyDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(PartyRole) role?: PartyRole;
  @IsOptional() @IsEnum(PartyType) type?: PartyType;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsNumber() opening?: number;
  @IsOptional() @IsBoolean() hidden?: boolean;
}
