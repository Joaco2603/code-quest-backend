import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsIn,
  IsString,
  IsBoolean,
} from 'class-validator';

export class PaginationDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform((value): number => {
    if (!value.obj) {
      value.obj = { offset: 0 };
      return value.obj.offset;
    }
    if (Number(value?.obj?.offset)) {
      return Number(value?.obj?.offset);
    } else {
      return 0;
    }
  })
  offset?: number = 0;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform((value): number => {
    if (!value.obj) {
      value.obj = { limit: 1 };
      return value.obj.limit;
    }
    if (Number(value?.obj?.limit)) {
      return Number(value?.obj?.limit);
    } else {
      return 1;
    }
  })
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform((value): number => {
    if (!value.obj) {
      value.obj = { page: 1 };
      return value.obj.page;
    }
    if (Number(value?.obj?.page)) {
      return Number(value?.obj?.page);
    } else {
      return 1;
    }
  })
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform((value): number => {
    if (!value.obj) {
      value.obj = { pageSize: 10 };
      return value.obj.pageSize;
    }
    if (Number(value?.obj?.pageSize)) {
      return Number(value?.obj?.pageSize);
    } else {
      return 10;
    }
  })
  pageSize?: number;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsIn(['asc', 'desc', 'ASC', 'DESC'])
  order?: 'asc' | 'desc' | 'ASC' | 'DESC';

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Transform((value) => {
    if (!value.obj) return false;
    return value?.obj?.all === 'true';
  })
  @IsBoolean()
  all?: boolean;

  @IsOptional()
  @Transform((value) => {
    if (!value.obj) return true;
    if (value?.obj?.isActive == 'true') return true;
    if (value?.obj?.isActive == 'false') return false;
  })
  @IsBoolean()
  isActive?: boolean;
}
