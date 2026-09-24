import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto.js';
import { CourseStatus } from '../entities/course-status.enum.js';
import { SkillLevel } from '../entities/skill-level.enum.js';
import { MAX_CATALOG_ID } from '../pipes/catalog-id.pipe.js';
import { trim } from './trim.js';

export class CourseQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: SkillLevel })
  @IsOptional()
  @IsEnum(SkillLevel)
  level?: SkillLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CATALOG_ID)
  categoryId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CATALOG_ID)
  technologyId?: number;
}

export class AdminCourseQueryDto extends CourseQueryDto {
  @ApiPropertyOptional({ enum: CourseStatus })
  @IsOptional()
  @IsEnum(CourseStatus)
  status?: CourseStatus;
}
