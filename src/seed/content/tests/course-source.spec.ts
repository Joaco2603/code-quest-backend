import { BadRequestException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCourseSource, publicationPreview } from '../course-source.js';
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
it('keeps enrichment null when the source has no curation fields', () => {
  const parsed = parseCourseSource({ cursos: [course] });
  expect(parsed.courses[0].enrichment).toBeNull();
});
it('accepts flat level, technologies, image and duration as curated truth', () => {
  const parsed = parseCourseSource({
    cursos: [
      {
        ...course,
        imageUrl: 'https://cdn.example.com/img.jpg',
        durationMinutes: 1470,
        level: 'intermediate',
        technologyNames: ['Node.js', ' node.js ', 'NestJS'],
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
it('counts image and duration as curated on create', () => {
  const parsed = parseCourseSource({
    cursos: [
      {
        ...course,
        imageUrl: 'https://cdn.example.com/img.jpg',
        durationMinutes: 1470,
        level: 'intermediate',
        technologyNames: ['PHP', 'IA'],
      },
    ],
  });
  expect(parsed.courses[0].enrichment).toEqual({
    imageUrl: 'https://cdn.example.com/img.jpg',
    durationMinutes: 1470,
    level: 'intermediate',
    technologyNames: ['PHP', 'IA'],
  });
  expect(publicationPreview(parsed.courses)).toEqual({
    curatedOnCreate: {
      imageUrl: 1,
      durationMinutes: 1,
      level: 1,
      technologies: 1,
    },
    missingPublicationFields: [],
  });
});
it('reports absent image and duration as pending publication fields', () => {
  const parsed = parseCourseSource({ cursos: [course] });
  expect(parsed.courses[0].enrichment).toBeNull();
  expect(publicationPreview(parsed.courses)).toEqual({
    curatedOnCreate: {
      imageUrl: 0,
      durationMinutes: 0,
      level: 0,
      technologies: 0,
    },
    missingPublicationFields: [
      'imageUrl',
      'durationMinutes',
      'level',
      'technologyIds',
    ],
  });
});
it.each([
  { imageUrl: 'notaurl', durationMinutes: 60 },
  { imageUrl: '', durationMinutes: 60 },
  { imageUrl: 'ftp://cdn.example.com/img.jpg', durationMinutes: 60 },
  { imageUrl: 'https://cdn.example.com/img.jpg', durationMinutes: 0 },
  { imageUrl: 'https://cdn.example.com/img.jpg', durationMinutes: -5 },
  { imageUrl: 'https://cdn.example.com/img.jpg', durationMinutes: 1.5 },
  { imageUrl: 'https://cdn.example.com/img.jpg', durationMinutes: 1000001 },
  { imageUrl: 'https://cdn.example.com/img.jpg', durationMinutes: '90' },
])('rejects present-but-invalid media %j before writing', (media) => {
  expect(() =>
    parseCourseSource({
      cursos: [
        {
          ...course,
          ...media,
        },
      ],
    }),
  ).toThrow('Invalid source field');
});
it.each([
  { level: 'expert', technologyNames: [] },
  { level: null, technologyNames: [''] },
  { level: null, technologyNames: 'Node.js' },
])('rejects invalid curation fields %j', (curation) => {
  expect(() =>
    parseCourseSource({
      cursos: [
        {
          ...course,
          ...curation,
        },
      ],
    }),
  ).toThrow(BadRequestException);
});
it('reads curated media from the course file with format validation', () => {
  const parsed = parseCourseSource(
    JSON.parse(
      readFileSync(
        join(
          dirname(fileURLToPath(import.meta.url)),
          '../../../../COURSES.enriched.json',
        ),
        'utf8',
      ),
    ),
  );
  const byTitle = new Map(parsed.courses.map((item) => [item.title, item]));
  expect(parsed.courses).toHaveLength(74);
  expect(parsed.skippedWithoutDevtalles).toBe(8);
  // Format validation passed for every record; correctness against the
  // official pages is still pending verification before publishing.
  expect(parsed.courses.every((item) => item.enrichment?.imageUrl)).toBe(true);
  expect(
    parsed.courses.every((item) => item.enrichment?.durationMinutes != null),
  ).toBe(true);
  expect(
    byTitle.get('Spring AI: LLMs, Tools, RAG, Agentes y Deploy en AWS')
      ?.enrichment,
  ).toMatchObject({
    level: 'advanced',
    technologyNames: ['Java', 'IA'],
  });
  expect(
    byTitle.get('Laravel 13: AI, REST, JWT, Repository Pattern')?.enrichment,
  ).toMatchObject({
    level: 'beginner',
    technologyNames: ['PHP', 'IA'],
  });
  expect(
    byTitle.get('RN Expo + Gemini: Aplicaciones con inteligencia artificial')
      ?.enrichment,
  ).toMatchObject({
    technologyNames: ['React Native', 'IA'],
  });
  expect(
    byTitle.get('Spring Boot 4: Arquitectura de Microservicios')?.enrichment,
  ).toMatchObject({
    technologyNames: ['Java', 'Docker'],
  });
  expect(
    byTitle.get('Dart: De cero hasta los detalles')?.enrichment,
  ).toMatchObject({
    technologyNames: ['Dart'],
  });
  expect(
    byTitle.get('Docker: Guía práctica de uso para desarrolladores')
      ?.enrichment,
  ).toMatchObject({
    technologyNames: ['Docker'],
  });
  expect(
    byTitle.get('Principios: SOLID y Clean Code')?.enrichment,
  ).toMatchObject({
    technologyNames: [],
  });
});
