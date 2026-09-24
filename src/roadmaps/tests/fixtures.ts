import type { AssessmentProfile } from '../../assessments/interfaces/index.js';
import type { CourseResponseDto } from '../../catalog/dto/catalog-response.dto.js';
import { CourseStatus, SkillLevel } from '../../catalog/entities.js';

export function course(
  partial: Pick<CourseResponseDto, 'id' | 'title'> & Partial<CourseResponseDto>,
): CourseResponseDto {
  return {
    description: null,
    url: null,
    imageUrl: null,
    durationMinutes: 60,
    instructor: null,
    level: SkillLevel.Beginner,
    status: CourseStatus.Published,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    categories: [],
    technologies: [],
    prerequisiteIds: [],
    ...partial,
  };
}

export function profile(
  partial: Partial<AssessmentProfile> = {},
): AssessmentProfile {
  return {
    assessmentId: 8,
    questionnaireId: 1,
    profileVersion: 1,
    completedAt: '2026-09-21T12:00:00.000Z',
    interests: { categoryIds: [1], technologyIds: [3] },
    goals: ['Construir APIs'],
    skills: [
      {
        technologyId: 3,
        level: SkillLevel.Beginner,
        source: 'self_reported',
      },
    ],
    readyForGeneration: true,
    ...partial,
  };
}
