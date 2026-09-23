import { ApiProperty } from '@nestjs/swagger';

/**
 * Shared HTTP response contracts.
 *
 * Single explicit wrapping mechanism for the whole API:
 * - Services return raw entities or `{ items, total, limit, offset }`.
 *   They NEVER wrap results in `{ data }`.
 * - Controllers wrap exactly once with `toDataResponse` or
 *   `toPaginatedResponse` right before returning.
 *
 * Following this rule keeps Swagger honest and prevents `data.data`
 * responses. Error responses stay unwrapped (see GlobalExceptionFilter).
 */
export class PaginationMetaDto {
  @ApiProperty({
    description: 'Total records matching filters and actor scope.',
    example: 100,
  })
  total: number;

  @ApiProperty({ description: 'Page size applied.', example: 20 })
  limit: number;

  @ApiProperty({ description: 'Records skipped.', example: 0 })
  offset: number;
}

export interface DataResponse<T> {
  data: T;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMetaDto;
}

export function toDataResponse<T>(data: T): DataResponse<T> {
  return { data };
}

export function toPaginatedResponse<T>(
  data: T[],
  meta: PaginationMetaDto,
): PaginatedResponse<T> {
  return { data, meta };
}
