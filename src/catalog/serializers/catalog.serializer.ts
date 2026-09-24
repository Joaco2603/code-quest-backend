import type { Course } from '../entities/catalog.entities.js';
import type {
  CatalogSummaryResponseDto,
  CourseResponseDto,
} from '../dto/catalog.dto.js';

function toIsoUtc(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

/**
 * Explicit catalog serializers. Every public field is picked by hand:
 * no entity spreads, so extra columns never leak. Absent nullable fields
 * map to null and dates serialize to ISO 8601 UTC.
 */
export function serializeCatalogSummary(source: {
  id: number;
  name: string;
}): CatalogSummaryResponseDto {
  return {
    id: source.id,
    name: source.name,
  };
}

export function serializeCatalogSummaries(
  sources: { id: number; name: string }[],
): CatalogSummaryResponseDto[] {
  return sources.map((source) => serializeCatalogSummary(source));
}

export function serializeCourse(source: Course): CourseResponseDto {
  return {
    id: source.id,
    title: source.title,
    description: source.description ?? null,
    url: source.url ?? null,
    imageUrl: source.imageUrl ?? null,
    durationMinutes: source.durationMinutes ?? null,
    instructor: source.instructor ?? null,
    level: source.level ?? null,
    status: source.status,
    createdAt: toIsoUtc(source.createdAt),
    updatedAt: toIsoUtc(source.updatedAt),
    categories: serializeCatalogSummaries(source.categories ?? []),
    technologies: serializeCatalogSummaries(source.technologies ?? []),
    prerequisiteIds: (source.prerequisites ?? [])
      .map((item) => item.id)
      .sort((a, b) => a - b),
  };
}

export function serializeCourses(sources: Course[]): CourseResponseDto[] {
  return sources.map((source) => serializeCourse(source));
}
