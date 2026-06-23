import { IsEmail } from 'class-validator';

export class UpdateConfigDto {
  @IsEmail() orderEmail: string;
}
