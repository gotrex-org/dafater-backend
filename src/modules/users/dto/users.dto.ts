import { IsArray, IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class CreateUserDto {
  @IsString() name: string;
  @IsString() @Length(4, 8) pin: string;
  @IsOptional() @IsBoolean() admin?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) views?: string[];
}

export class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() @Length(4, 8) pin?: string;
  @IsOptional() @IsBoolean() admin?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) views?: string[];
}
