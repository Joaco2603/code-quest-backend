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
