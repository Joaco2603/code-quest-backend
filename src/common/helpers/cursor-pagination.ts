import { FindManyOptions, MoreThan, LessThan, FindOptionsOrder } from 'typeorm';
import { PaginationDto } from '../dto/pagination.dto.js';

export class PaginationUtil {
  static buildFindOptions<T>(
    paginationDto: PaginationDto,
    additionalWhere: any = {},
    relations?: any,
  ): FindManyOptions<T> {
    const {
      offset = 0,
      limit = 10,
      page,
      pageSize,
      sort = 'id',
      order = 'ASC',
      cursor,
      isActive = true,
    } = paginationDto;

    const orderNormalized =
      typeof order === 'string' ? order.toUpperCase() : 'ASC';
    let skip: number | undefined;
    let take: number | undefined;
    let where: any = { isActive, ...additionalWhere };

    // Cursor-based pagination
    if (cursor) {
      where = {
        ...where,
        ...(orderNormalized === 'ASC'
          ? { id: MoreThan(cursor) }
          : { id: LessThan(cursor) }),
      };
      take = limit;
    }
    // Page-based pagination
    else if (page && pageSize) {
      skip = (page - 1) * pageSize;
      take = pageSize;
    }
    // Offset/limit pagination
    else {
      skip = offset;
      take = limit;
    }

    return {
      skip,
      take,
      where,
      relations,
      order: {
        [sort]: orderNormalized as 'ASC' | 'DESC',
      } as FindOptionsOrder<T>,
    };
  }
}
