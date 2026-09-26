import type { CourseResponseDto } from '../catalog/dto/course-response.dto.js';
import { SkillLevel } from '../catalog/entities/skill-level.enum.js';
import type {
  PersonalArea,
  PersonalLearningProfile,
  PersonalLevel,
} from './personal-profile.js';

/** Prompt budget. Prerequisite closure can exceed it only for the first match. */
export const MAX_CANDIDATE_COURSES = 40;

const LEVEL_RANK: Record<SkillLevel, number> = {
  [SkillLevel.Beginner]: 0,
  [SkillLevel.Intermediate]: 1,
  [SkillLevel.Advanced]: 2,
};

const LEARNER_RANK: Record<PersonalLevel, number> = {
  beginner: 0,
  basic: 0,
  intermediate: 1,
  advanced: 2,
};

const AREA_TERMS: Record<PersonalArea, string[]> = {
  frontend: ['frontend', 'react', 'angular', 'vue', 'css', 'astro', 'html'],
  backend: ['backend', 'nest', 'node', 'java', 'php', 'go', 'api'],
  fullstack: ['frontend', 'backend', 'react', 'node', 'nest', 'fullstack'],
  mobile: ['mobile', 'flutter', 'react native', 'android', 'ios'],
  devops: ['devops', 'docker', 'kubernetes', 'infra'],
  ai: ['ia', 'inteligencia', 'machine', 'python', 'llm'],
  data: ['sql', 'datos', 'database', 'postgres', 'mongo'],
};

/**
 * Published courses the model may see for a personal roadmap.
 * Area and known technologies narrow the catalog. Prerequisites stay in
 * the set so the later selection can be ordered.
 */
export function selectPersonalCandidates(
  catalog: CourseResponseDto[],
  profile: PersonalLearningProfile,
): CourseResponseDto[] {
  const byId = new Map(catalog.map((course) => [course.id, course]));
  const terms = AREA_TERMS[profile.area];
  const ranked = catalog
    .filter((course) => mentions(course, terms) || skillHit(course, profile))
    .sort((left, right) => {
      const delta = score(right, profile, terms) - score(left, profile, terms);
      return delta === 0 ? left.id - right.id : delta;
    });
  const pool = ranked.length ? ranked : byLevel(catalog, profile.level);
  return takeWithPrerequisites(pool, byId);
}

function takeWithPrerequisites(
  ranked: CourseResponseDto[],
  byId: Map<number, CourseResponseDto>,
) {
  let chosen: CourseResponseDto[] = [];
  for (const course of ranked) {
    if (chosen.some((item) => item.id === course.id)) continue;
    const next = closeOverPrerequisites([...chosen, course], byId);
    if (chosen.length === 0 || next.length <= MAX_CANDIDATE_COURSES)
      chosen = next;
  }
  return chosen;
}

function byLevel(
  catalog: CourseResponseDto[],
  level: PersonalLevel | null,
) {
  return [...catalog].sort((left, right) => {
    const delta = distance(left.level, level) - distance(right.level, level);
    return delta === 0 ? left.id - right.id : delta;
  });
}

function score(
  course: CourseResponseDto,
  profile: PersonalLearningProfile,
  terms: string[],
) {
  let value = mentions(course, terms) ? 4 : 0;
  value += 3 - distance(course.level, profile.level);
  for (const skill of profile.skills) {
    if (!course.technologies.some((item) => sameName(item.name, skill.name)))
      continue;
    if (skill.level === 'never') continue;
    value += skill.level === 'professional' ? 2 : 5;
  }
  return value;
}

function skillHit(course: CourseResponseDto, profile: PersonalLearningProfile) {
  return profile.skills.some(
    (skill) =>
      skill.level !== 'never' &&
      course.technologies.some((item) => sameName(item.name, skill.name)),
  );
}

function mentions(course: CourseResponseDto, terms: string[]) {
  const blob = [
    course.title,
    course.description ?? '',
    ...course.categories.map((item) => item.name),
    ...course.technologies.map((item) => item.name),
  ]
    .join(' ')
    .toLocaleLowerCase('es');
  return terms.some((term) => blob.includes(term));
}

function distance(level: SkillLevel | null, learner: PersonalLevel | null) {
  if (!level || !learner) return 1;
  return Math.abs(LEVEL_RANK[level] - LEARNER_RANK[learner]);
}

function sameName(left: string, right: string) {
  return (
    left.trim().toLocaleLowerCase('es') === right.trim().toLocaleLowerCase('es')
  );
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
