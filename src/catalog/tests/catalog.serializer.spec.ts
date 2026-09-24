import { CourseStatus, SkillLevel } from '../entities/catalog.entities.js';
import type { Course } from '../entities/catalog.entities.js';
import {
  serializeCatalogSummaries,
  serializeCatalogSummary,
  serializeCourse,
} from '../serializers/catalog.serializer.js';

function buildCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: 1,
    title: 'TypeScript basics',
    description: 'Learn the foundations',
    url: 'https://example.com/course',
    imageUrl: 'https://example.com/image.png',
    durationMinutes: 120,
    instructor: 'Instructor',
    level: SkillLevel.Beginner,
    status: CourseStatus.Published,
    createdAt: new Date('2026-01-15T12:00:00.000Z'),
    updatedAt: new Date('2026-01-16T12:00:00.000Z'),
    categories: [{ id: 1, name: 'Backend' } as never],
    technologies: [{ id: 2, name: 'TypeScript' } as never],
    prerequisites: [{ id: 3 } as never, { id: 2 } as never],
    ...overrides,
  } as Course;
}

describe('catalog serializers', () => {
  it('serializes a course with explicit fields and sorted prerequisiteIds', () => {
    const detail = serializeCourse(buildCourse());

    expect(detail).toEqual({
      id: 1,
      title: 'TypeScript basics',
      description: 'Learn the foundations',
      url: 'https://example.com/course',
      imageUrl: 'https://example.com/image.png',
      durationMinutes: 120,
      instructor: 'Instructor',
      level: SkillLevel.Beginner,
      status: CourseStatus.Published,
      createdAt: '2026-01-15T12:00:00.000Z',
      updatedAt: '2026-01-16T12:00:00.000Z',
      categories: [{ id: 1, name: 'Backend' }],
      technologies: [{ id: 2, name: 'TypeScript' }],
      prerequisiteIds: [2, 3],
    });
  });

  it('ignores extra and sensitive properties without spreading entities', () => {
    const source = Object.assign(buildCourse(), {
      password: 'should-never-leak',
      leakedInternalFlag: true,
      prerequisites: [{ id: 5, title: 'Hidden', password: 'x' } as never],
      categories: [
        { id: 1, name: 'Backend', secret: 'hidden', extra: 1 } as never,
      ],
    });

    const detail = serializeCourse(source);

    expect(detail).not.toHaveProperty('password');
    expect(detail).not.toHaveProperty('leakedInternalFlag');
    expect(JSON.stringify(detail)).not.toContain('should-never-leak');
    expect(detail.categories).toEqual([{ id: 1, name: 'Backend' }]);
    expect(detail.prerequisiteIds).toEqual([5]);
    expect(Object.keys(detail).sort()).toEqual(
      [
        'id',
        'title',
        'description',
        'url',
        'imageUrl',
        'durationMinutes',
        'instructor',
        'level',
        'status',
        'createdAt',
        'updatedAt',
        'categories',
        'technologies',
        'prerequisiteIds',
      ].sort(),
    );
  });

  it('maps absent nullable fields to null and dates to ISO UTC', () => {
    const source = buildCourse({
      description: undefined as unknown as null,
      url: undefined as unknown as null,
      imageUrl: undefined as unknown as null,
      durationMinutes: undefined as unknown as null,
      instructor: undefined as unknown as null,
      level: undefined as unknown as null,
      categories: undefined as unknown as never[],
      technologies: undefined as unknown as never[],
      prerequisites: undefined as unknown as never[],
    });

    const detail = serializeCourse(source);

    expect(detail.description).toBeNull();
    expect(detail.url).toBeNull();
    expect(detail.imageUrl).toBeNull();
    expect(detail.durationMinutes).toBeNull();
    expect(detail.instructor).toBeNull();
    expect(detail.level).toBeNull();
    expect(detail.categories).toEqual([]);
    expect(detail.technologies).toEqual([]);
    expect(detail.prerequisiteIds).toEqual([]);
    expect(detail.createdAt).toBe('2026-01-15T12:00:00.000Z');
  });

  it('serializes taxonomy summaries with exact fields', () => {
    expect(serializeCatalogSummary({ id: 1, name: 'Backend' })).toEqual({
      id: 1,
      name: 'Backend',
    });
    expect(
      serializeCatalogSummaries([
        { id: 2, name: 'B', extra: true } as { id: number; name: string },
        { id: 1, name: 'A' },
      ]),
    ).toEqual([
      { id: 2, name: 'B' },
      { id: 1, name: 'A' },
    ]);
  });
});
