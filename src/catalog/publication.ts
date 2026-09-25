import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Course } from './entities/course.entity.js';
import { CourseStatus } from './entities/course-status.enum.js';

export interface PublishableCourse {
  description: string | null;
  url: string | null;
  imageUrl: string | null;
  durationMinutes: number | null;
  instructor: string | null;
  level: string | null;
  categories: { length: number } | null | undefined;
  technologies: { length: number } | null | undefined;
  prerequisites: Array<{ status: CourseStatus }>;
}

// Single source of truth for "is this course complete enough to publish".
// Used by CatalogService.changeStatus/updateCourse AND by the content
// importer (--publish-ready, plan mode), so the importer can never publish
// through a cheaper parallel rule set.
export function publicationBlockers(course: PublishableCourse): string[] {
  const required = [
    'description',
    'url',
    'imageUrl',
    'durationMinutes',
    'instructor',
    'level',
  ] as const;
  const missing: string[] = required.filter((key) => !course[key]);
  if (!course.categories?.length) missing.push('categoryIds');
  if (!course.technologies?.length) missing.push('technologyIds');
  return missing;
}

export function hasUnpublishedPrerequisites(course: {
  prerequisites: Array<{ status: CourseStatus }>;
}): boolean {
  return course.prerequisites.some(
    (item) => item.status !== CourseStatus.Published,
  );
}

export function assertPublishable(course: PublishableCourse): void {
  const missing = publicationBlockers(course);
  if (missing.length)
    throw new BadRequestException({
      message: 'Complete the course before publishing',
      missing,
    });
  if (hasUnpublishedPrerequisites(course))
    throw new ConflictException('Publish all prerequisites first');
}
