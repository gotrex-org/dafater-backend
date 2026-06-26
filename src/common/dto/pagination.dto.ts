import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/** Standard query params for any paginated list endpoint. */
export class PaginationQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  pageSize?: number = 20;

  /** "true" → return the full list (used by dropdowns), bypassing pagination. */
  @IsOptional() @IsString()
  all?: string;

  /** optional free-text filter (service decides which fields it applies to). */
  @IsOptional() @IsString()
  search?: string;

  /** optional date-range filter — ISO date strings e.g. "2024-01-01". */
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;

  /** filter treasury movements by a specific treasury account uid */
  @IsOptional() @IsString() treasuryId?: string;
}
