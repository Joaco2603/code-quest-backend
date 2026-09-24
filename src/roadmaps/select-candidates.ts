import type { AssessmentProfile } from '../assessments/interfaces/index.js';
import type { CourseResponseDto } from '../catalog/dto/course-response.dto.js';
import { SkillLevel } from '../catalog/entities/catalog.entities.js';

/** Prompt budget. Prerequisite closure can exceed it only for the first match. */
export const MAX_CANDIDATE_COURSES = 40;

const LEVEL_RANK: Record<SkillLevel, number> = {
  [SkillLevel.Beginner]: 0,
  [SkillLevel.Intermediate]: 1,
  [SkillLevel.Advanced]: 2,
};

/**
 * Published courses the model is allowed to see.
 * Interests and self-reported skills narrow the catalog; published prerequisites
 * of those courses stay in the set so a later selection can be ordered.
 */
export function selectCandidates(
  catalog: CourseResponseDto[],
  profile: AssessmentProfile,
): CourseResponseDto[] {
  const byId = new Map(catalog.map((course) => [course.id, course]));
  const categories = new Set(profile.interests.categoryIds);
  const technologies = new Set(profile.interests.technologyIds);
  const skills = new Map(
    profile.skills.map((skill) => [skill.technologyId, skill.level]),
  );
  const ranked = catalog
    .filter((course) => matches(course, categories, technologies, skills))
    .sort((left, right) => {
      const delta =
        score(right, categories, technologies, skills) -
        score(left, categories, technologies, skills);
      return delta === 0 ? left.id - right.id : delta;
    });

  let chosen: CourseResponseDto[] = [];
  for (const course of ranked) {
    if (chosen.some((item) => item.id === course.id)) continue;
    const next = closeOverPrerequisites([...chosen, course], byId);
    if (chosen.length === 0 || next.length <= MAX_CANDIDATE_COURSES)
      chosen = next;
  }
  return chosen;
}

function matches(
  course: CourseResponseDto,
  categories: Set<number>,
  technologies: Set<number>,
  skills: Map<number, SkillLevel | null>,
) {
  return (
    course.categories.some((category) => categories.has(category.id)) ||
    course.technologies.some(
      (technology) =>
        technologies.has(technology.id) || skills.has(technology.id),
    )
  );
}

function score(
  course: CourseResponseDto,
  categories: Set<number>,
  technologies: Set<number>,
  skills: Map<number, SkillLevel | null>,
) {
  let value = course.categories.reduce(
    (total, category) => total + (categories.has(category.id) ? 3 : 0),
    0,
  );
  for (const technology of course.technologies) {
    if (technologies.has(technology.id)) value += 5;
    if (!skills.has(technology.id)) continue;
    value += 2;
    const level = skills.get(technology.id);
    if (!level || !course.level) continue;
    const distance = Math.abs(LEVEL_RANK[course.level] - LEVEL_RANK[level]);
    value += distance === 0 ? 3 : distance === 1 ? 1 : 0;
  }
  return value;
}

function closeOverPrerequisites(
  roots: CourseResponseDto[],
  byId: Map<number, CourseResponseDto>,
) {
  const ordered: CourseResponseDto[] = [];
  const seen = new Set<number>();
  const visit = (id: number, stack: Set<number>) => {
    if (seen.has(id) || stack.has(id)) return;
    const course = byId.get(id);
    if (!course) return;
    stack.add(id);
    for (const prerequisiteId of course.prerequisiteIds)
      visit(prerequisiteId, stack);
    stack.delete(id);
    seen.add(id);
    ordered.push(course);
  };
  for (const root of roots) visit(root.id, new Set());
  return ordered;
}
