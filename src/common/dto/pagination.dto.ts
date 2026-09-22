import { Transform, Type } from 'class-transformer';
import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsIn,
  IsString,
  IsBoolean,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationDto {
  @ApiPropertyOptional({ default: 0, minimum: 0, example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100, example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 1, minimum: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100, example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ example: 'createdAt' })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc', 'ASC', 'DESC'], example: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc', 'ASC', 'DESC'])
  order?: 'asc' | 'desc' | 'ASC' | 'DESC';

  @ApiPropertyOptional({
    description: 'Opaque cursor for keyset pagination',
    example: 'd29ya2VyOjEwMA==',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Return records regardless of the isActive filter',
    type: Boolean,
    example: false,
  })
  @IsOptional()
  @Transform(({ obj }) => {
    if (!obj || !Object.prototype.hasOwnProperty.call(obj, 'all')) {
      return undefined;
    }
    const raw = obj.all;
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return raw;
  })
  @IsBoolean()
  all?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by active state when supported by the endpoint',
    type: Boolean,
    example: true,
  })
  @IsOptional()
  @Transform(({ obj }) => {
    if (!obj || !Object.prototype.hasOwnProperty.call(obj, 'isActive')) {
      return undefined;
    }
    const raw = obj.isActive;
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return raw;
  })
  @IsBoolean()
  isActive?: boolean;
}
