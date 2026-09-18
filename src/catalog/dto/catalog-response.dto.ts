import { ApiProperty } from '@nestjs/swagger';
import { CourseStatus, SkillLevel } from '../entities.js';
import { PaginationMetaDto } from '../../common/dto/api-response.dto.js';

/**
 * Public output contracts for the catalog (Etapa 4).
 *
 * Services return these DTOs unwrapped; controllers wrap them once with
 * `toDataResponse` / `toPaginatedResponse`. Internal roadmap consumers
 * (`getPublishedCatalog`, `validateRoadmapSelection`,
 * `getCoursesForExistingRoadmap`) use the unwrapped DTOs directly.
 * Relations are explicit summaries: categories/technologies as `{ id, name }`
 * and prerequisites as sorted `prerequisiteIds`. Never expanded entities.
 */
export class CategoryResponseDto {
  @ApiProperty({ description: 'Category id.', example: 1 })
  id: number;

  @ApiProperty({ description: 'Category name.', example: 'Backend' })
  name: string;
}

export class TechnologyResponseDto {
  @ApiProperty({ description: 'Technology id.', example: 1 })
  id: number;

  @ApiProperty({ description: 'Technology name.', example: 'TypeScript' })
  name: string;
}

export class CourseResponseDto {
  @ApiProperty({ description: 'Course id.', example: 1 })
  id: number;

  @ApiProperty({ description: 'Course title.', example: 'TypeScript basics' })
  title: string;

  @ApiProperty({
    description: 'Course description.',
    nullable: true,
    type: String,
  })
  description: string | null;

  @ApiProperty({
    description: 'Course URL.',
    nullable: true,
    type: String,
  })
  url: string | null;

  @ApiProperty({
    description: 'Course image URL.',
    nullable: true,
    type: String,
  })
  imageUrl: string | null;

  @ApiProperty({
    description: 'Duration in minutes.',
    nullable: true,
    type: Number,
  })
  durationMinutes: number | null;

  @ApiProperty({
    description: 'Instructor name.',
    nullable: true,
    type: String,
  })
  instructor: string | null;

  @ApiProperty({
    description: 'Skill level.',
    enum: SkillLevel,
    nullable: true,
  })
  level: SkillLevel | null;

  @ApiProperty({ description: 'Publication status.', enum: CourseStatus })
  status: CourseStatus;

  @ApiProperty({
    description: 'Creation date in ISO 8601 UTC.',
    example: '2026-01-15T12:00:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Last update date in ISO 8601 UTC.',
    example: '2026-01-15T12:00:00.000Z',
  })
  updatedAt: string;

  @ApiProperty({
    description: 'Assigned categories (explicit summaries).',
    type: () => [CategoryResponseDto],
  })
  categories: CategoryResponseDto[];

  @ApiProperty({
    description: 'Assigned technologies (explicit summaries).',
    type: () => [TechnologyResponseDto],
  })
  technologies: TechnologyResponseDto[];

  @ApiProperty({
    description: 'Prerequisite course ids, sorted ascending.',
    type: [Number],
    example: [1, 2],
  })
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

export class CategoryDataResponseDto {
  @ApiProperty({ type: () => CategoryResponseDto })
  data: CategoryResponseDto;
}

export class CategoryCollectionDataResponseDto {
  @ApiProperty({ type: () => [CategoryResponseDto] })
  data: CategoryResponseDto[];
}

export class TechnologyDataResponseDto {
  @ApiProperty({ type: () => TechnologyResponseDto })
  data: TechnologyResponseDto;
}

export class TechnologyCollectionDataResponseDto {
  @ApiProperty({ type: () => [TechnologyResponseDto] })
  data: TechnologyResponseDto[];
}

export class LevelCollectionDataResponseDto {
  @ApiProperty({
    description: 'Fixed skill levels.',
    enum: SkillLevel,
    isArray: true,
    example: ['beginner', 'intermediate', 'advanced'],
  })
  data: SkillLevel[];
}
