import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../common/dto/api-response.dto.js';
import { CourseStatus } from '../entities/course-status.enum.js';
import { SkillLevel } from '../entities/skill-level.enum.js';

export class CatalogSummaryResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Backend' })
  name: string;
}

export class CourseResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'TypeScript basics' })
  title: string;

  @ApiProperty({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ nullable: true, type: String })
  url: string | null;

  @ApiProperty({ nullable: true, type: String })
  imageUrl: string | null;

  @ApiProperty({ nullable: true, type: Number })
  durationMinutes: number | null;

  @ApiProperty({ nullable: true, type: String })
  instructor: string | null;

  @ApiProperty({ enum: SkillLevel, nullable: true })
  level: SkillLevel | null;

  @ApiProperty({ enum: CourseStatus })
  status: CourseStatus;

  @ApiProperty({ example: '2026-01-15T12:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-01-15T12:00:00.000Z' })
  updatedAt: string;

  @ApiProperty({ type: () => [CatalogSummaryResponseDto] })
  categories: CatalogSummaryResponseDto[];

  @ApiProperty({ type: () => [CatalogSummaryResponseDto] })
  technologies: CatalogSummaryResponseDto[];

  @ApiProperty({ type: [Number], example: [1, 2] })
  prerequisiteIds: number[];
}

export class CourseDataResponseDto {
  @ApiProperty({ type: () => CourseResponseDto })
  data: CourseResponseDto;
}

export class CoursePaginatedResponseDto {
  @ApiProperty({ type: () => [CourseResponseDto] })
  data: CourseResponseDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class CatalogSummaryDataResponseDto {
  @ApiProperty({ type: () => CatalogSummaryResponseDto })
  data: CatalogSummaryResponseDto;
}

export class CatalogSummaryCollectionDataResponseDto {
  @ApiProperty({ type: () => [CatalogSummaryResponseDto] })
  data: CatalogSummaryResponseDto[];
}

export class LevelCollectionDataResponseDto {
  @ApiProperty({
    enum: SkillLevel,
    isArray: true,
    example: ['beginner', 'intermediate', 'advanced'],
  })
  data: SkillLevel[];
}
