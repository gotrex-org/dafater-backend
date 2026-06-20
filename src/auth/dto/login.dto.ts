import { IsString, Length } from 'class-validator';

export class LoginDto {
  @IsString()
  userId: string;

  @IsString()
  @Length(4, 8)
  pin: string;
}
