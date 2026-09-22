import { PaginationDto } from '../dto/pagination.dto.js';

/**
 * Single precedence for pagination inputs shared by users, questionnaires
 * and catalog listings:
 *
 * - an explicit `limit` always wins over `pageSize`, which wins over
 *   `defaultLimit`;
 * - an explicit non-zero `offset` always wins over an offset derived from
 *   `page`, so page=1 and page=2 share the same limit and no records are
 *   skipped between pages.
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

  if (!hasExplicitOffset && page !== undefined && page > 1) {
    return { limit, offset: (page - 1) * limit };
  }

  return { limit, offset: dto.offset ?? 0 };
}
