import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CourseStatus, SkillLevel } from './entities.js';
import { MAX_CATALOG_ID } from './catalog-id.pipe.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class NameDto {
  @ApiProperty({ example: 'TypeScript', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name: string;
}

export class CreateCourseDto {
  @ApiProperty({ example: 'TypeScript: fundamentos' })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  title: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 10000)
  description?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'https://cursos.devtalles.com/courses/typescript',
  })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  url?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  imageUrl?: string | null;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: 1,
    maximum: 1000000,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  durationMinutes?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 150)
  instructor?: string | null;

  @ApiPropertyOptional({ enum: SkillLevel, nullable: true })
  @IsOptional()
  @IsEnum(SkillLevel)
  level?: SkillLevel | null;

  @ApiPropertyOptional({ type: [Number] })
  @ValidateIf((_o, value) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(MAX_CATALOG_ID, { each: true })
  categoryIds?: number[];

  @ApiPropertyOptional({ type: [Number] })
  @ValidateIf((_o, value) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(MAX_CATALOG_ID, { each: true })
  technologyIds?: number[];

  @ApiPropertyOptional({ type: [Number] })
  @ValidateIf((_o, value) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(MAX_CATALOG_ID, { each: true })
  prerequisiteIds?: number[];
}

export class UpdateCourseDto extends PartialType(CreateCourseDto, {
  skipNullProperties: false,
}) {}

export class CourseQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

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
