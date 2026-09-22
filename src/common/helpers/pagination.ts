import { BadRequestException } from '@nestjs/common';
import { PaginationDto } from '../dto/pagination.dto.js';

/**
 * Single precedence for pagination inputs shared by users, questionnaires
 * and catalog listings:
 *
 * - an explicit `limit` always wins over `pageSize`, which wins over
 *   `defaultLimit`;
 * - an omitted offset, or an explicit `0`, is derived from `page`;
 * - a non-zero `offset` is accepted on its own, or together with `page`
 *   only when both describe the same row (`offset = (page - 1) * limit`),
 *   including `page=1`, which only matches `offset=0`.
 *
 * Services return `{ items, total, limit, offset }`; controllers wrap the
 * result once into `{ data, meta }` via `toPaginatedResponse`.
 */
export function resolvePagination(
  dto: Pick<PaginationDto, 'limit' | 'pageSize' | 'page' | 'offset'>,
  defaultLimit: number,
): { limit: number; offset: number } {
  const limit = dto.limit ?? dto.pageSize ?? defaultLimit;
  const page = dto.page;
  const hasExplicitOffset = dto.offset !== undefined && dto.offset !== 0;
  const pageOffset = page !== undefined ? (page - 1) * limit : undefined;

  if (
    hasExplicitOffset &&
    pageOffset !== undefined &&
    dto.offset !== pageOffset
  ) {
    throw new BadRequestException(
      'page and offset must describe the same page',
    );
  }

  if (!hasExplicitOffset && pageOffset !== undefined) {
    return { limit, offset: pageOffset };
  }

  return { limit, offset: dto.offset ?? 0 };
}
