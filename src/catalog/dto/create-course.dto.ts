import { Transform } from 'class-transformer';
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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SkillLevel } from '../entities/skill-level.enum.js';
import { MAX_CATALOG_ID } from '../pipes/catalog-id.pipe.js';
import { trim } from './trim.js';

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
