import type {
  Category,
  Course,
  Technology,
} from '../entities.js';
import type {
  CategoryResponseDto,
  CourseResponseDto,
  TechnologyResponseDto,
} from '../dto/catalog-response.dto.js';

function toIsoUtc(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

/**
 * Explicit catalog serializers (Etapa 4).
 * Every public field is picked by hand: no entity spreads, so adding a
 * column never leaks into the API. Absent nullable fields map to null and
 * dates serialize to ISO 8601 UTC. Relations are summaries (`{ id, name }`)
 * plus sorted `prerequisiteIds`; full entities are never expanded.
 */
export function serializeCategory(
  source: Category,
): CategoryResponseDto {
  return {
    id: source.id,
    name: source.name,
  };
}

export function serializeTechnology(
  source: Technology,
): TechnologyResponseDto {
  return {
    id: source.id,
    name: source.name,
  };
}

export function serializeCourse(source: Course): CourseResponseDto {
  const categories = (source.categories ?? []).map((item) =>
    serializeCategory(item),
  );
  const technologies = (source.technologies ?? []).map((item) =>
    serializeTechnology(item),
  );
  const prerequisiteIds = (source.prerequisites ?? [])
    .map((item) => item.id)
    .sort((a, b) => a - b);

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
    categories,
    technologies,
    prerequisiteIds,
  };
}

export function serializeCourses(sources: Course[]): CourseResponseDto[] {
  return sources.map((source) => serializeCourse(source));
}

export function serializeCategories(
  sources: Category[],
): CategoryResponseDto[] {
  return sources.map((source) => serializeCategory(source));
}

export function serializeTechnologies(
  sources: Technology[],
): TechnologyResponseDto[] {
  return sources.map((source) => serializeTechnology(source));
}
