import { parseCourseSource } from '../course-source.js';
const course = {
  titulo: 'TypeScript',
  descripcion: 'Fundamentos',
  instructor: 'Instructor',
  categoria: 'Desarrollo Web',
  plataformas: {
    devtalles: 'https://cursos.devtalles.com/courses/typescript/',
  },
};
it('uses DevTalles links, normalizes stable keys and reports unavailable courses', () => {
  const parsed = parseCourseSource({
    cursos: [
      course,
      {
        ...course,
        plataformas: { devtalles: null },
        url: 'https://udemy.com/course/other',
      },
    ],
  });
  expect(parsed.skippedWithoutDevtalles).toBe(1);
  expect(parsed.courses[0].key).toBe(
    'devtalles:https://cursos.devtalles.com/courses/typescript',
  );
  expect(parsed.courses[0]).not.toHaveProperty('durationMinutes');
});
it.each([
  'https://evil.example/courses/a',
  'https://cursos.devtalles.com.evil.example/courses/a',
  'http://cursos.devtalles.com/courses/a',
  'https://cursos.devtalles.com/courses/',
  'https://user:pass@cursos.devtalles.com/courses/a',
])('rejects invalid source link %s', (url) => {
  expect(() =>
    parseCourseSource({
      cursos: [{ ...course, plataformas: { devtalles: url } }],
    }),
  ).toThrow();
});
it('rejects duplicate canonical URLs and malformed source records before writing', () => {
  expect(() => parseCourseSource({ cursos: [course, course] })).toThrow(
    'Duplicate',
  );
  expect(() =>
    parseCourseSource({ cursos: [{ ...course, titulo: '' }] }),
  ).toThrow('titulo');
  expect(() => parseCourseSource({ cursos: null })).toThrow();
});
it('keeps enrichment null when the source has no sidecar', () => {
  const parsed = parseCourseSource({ cursos: [course] });
  expect(parsed.courses[0].enrichment).toBeNull();
});
it('accepts a curated enrichment sidecar and normalizes technology names', () => {
  const parsed = parseCourseSource({
    cursos: [
      {
        ...course,
        enrichment: {
          imageUrl: 'https://cdn.example.com/img.jpg',
          durationMinutes: 1470,
          level: 'intermediate',
          technologyNames: ['Node.js', ' node.js ', 'NestJS'],
        },
      },
    ],
  });
  expect(parsed.courses[0].enrichment).toEqual({
    imageUrl: 'https://cdn.example.com/img.jpg',
    durationMinutes: 1470,
    level: 'intermediate',
    technologyNames: ['Node.js', 'NestJS'],
  });
});
it.each([
  { imageUrl: 'http://cdn.example.com/img.jpg' },
  { durationMinutes: 0 },
  { durationMinutes: 1.5 },
  { level: 'expert' },
  { technologyNames: [''] },
  { technologyNames: 'Node.js' },
])('rejects invalid enrichment %j', (enrichment) => {
  expect(() =>
    parseCourseSource({
      cursos: [
        {
          ...course,
          enrichment: {
            imageUrl: null,
            durationMinutes: null,
            level: null,
            technologyNames: [],
            ...enrichment,
          },
        },
      ],
    }),
  ).toThrow();
});
