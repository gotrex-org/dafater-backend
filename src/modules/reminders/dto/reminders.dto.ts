import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { ReminderKind, ReminderRecurrence } from '@prisma/client';

export class CreateReminderDto {
  @IsString() title: string;
  @IsEnum(ReminderKind) kind: ReminderKind;
  @IsOptional() @IsNumber() amount?: number;
  @IsEnum(ReminderRecurrence) recurrence: ReminderRecurrence;
  @IsOptional() @IsInt() @Min(1) @Max(31) dayOfMonth?: number; // MONTHLY
  @IsOptional() @IsDateString() date?: string; // ONCE
  @IsOptional() @IsString() note?: string;
}

export class UpdateReminderDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsEnum(ReminderKind) kind?: ReminderKind;
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsEnum(ReminderRecurrence) recurrence?: ReminderRecurrence;
  @IsOptional() @IsInt() @Min(1) @Max(31) dayOfMonth?: number;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() note?: string;
}
