import { SkillLevel } from '../../catalog/entities.js';
import {
  MAX_CANDIDATE_COURSES,
  selectCandidates,
} from '../select-candidates.js';
import { course, profile } from './fixtures.js';

const nest = course({
  id: 2,
  title: 'NestJS',
  level: SkillLevel.Intermediate,
  categories: [{ id: 1, name: 'Backend' }],
  technologies: [{ id: 3, name: 'NestJS' }],
  prerequisiteIds: [1],
});
const typescript = course({
  id: 1,
  title: 'TypeScript',
  categories: [{ id: 9, name: 'Lenguaje' }],
  technologies: [{ id: 8, name: 'TypeScript' }],
});
const design = course({
  id: 7,
  title: 'Figma',
  categories: [{ id: 4, name: 'Diseño' }],
  technologies: [{ id: 11, name: 'Figma' }],
});

it('keeps published prerequisites of matching courses and drops the rest', () => {
  const selected = selectCandidates([design, nest, typescript], profile());
  expect(selected.map((item) => item.id)).toEqual([1, 2]);
});

it('ranks a closer skill level ahead of a weaker category match', () => {
  const advanced = course({
    id: 10,
    title: 'Backend general',
    level: SkillLevel.Advanced,
    categories: [{ id: 1, name: 'Backend' }],
  });
  const beginner = course({
    id: 11,
    title: 'Nest básico',
    level: SkillLevel.Beginner,
    technologies: [{ id: 3, name: 'NestJS' }],
  });
  const selected = selectCandidates([advanced, beginner], profile());
  expect(selected.map((item) => item.id)).toEqual([11, 10]);
});

it('returns nothing when no published course matches the profile', () => {
  expect(selectCandidates([design], profile())).toEqual([]);
});

it('stops adding roots once the prompt budget is full', () => {
  const catalog = Array.from(
    { length: MAX_CANDIDATE_COURSES + 5 },
    (_, index) =>
      course({
        id: index + 1,
        title: `Curso ${index + 1}`,
        categories: [{ id: 1, name: 'Backend' }],
      }),
  );
  expect(selectCandidates(catalog, profile())).toHaveLength(
    MAX_CANDIDATE_COURSES,
  );
});
