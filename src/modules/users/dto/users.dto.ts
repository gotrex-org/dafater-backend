import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export enum UserRole {
  STAFF = 'STAFF',
  CUSTOMER = 'CUSTOMER',
}

export class CreateUserDto {
  @IsString() name: string;
  @IsString() @IsOptional() username?: string;
  @IsString() @MinLength(1) pin: string;
  @IsOptional() @IsBoolean() admin?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) views?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) ledgerPartyIds?: string[];
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsString() partyId?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() @MinLength(1) pin?: string;
  @IsOptional() @IsBoolean() admin?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) views?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) ledgerPartyIds?: string[];
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsString() partyId?: string;
}
