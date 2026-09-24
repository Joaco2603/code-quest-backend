import { BadRequestException } from '@nestjs/common';
import { SkillLevel } from '../../catalog/entities.js';

export interface SourceEnrichment {
  imageUrl: string | null;
  durationMinutes: number | null;
  level: SkillLevel | null;
  technologyNames: string[];
}
export interface SourceCourse {
  key: string;
  title: string;
  description: string;
  instructor: string;
  url: string;
  category: string;
  enrichment?: SourceEnrichment | null;
}
function text(value: unknown, name: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new BadRequestException(`Invalid source field: ${name}`);
  return value.trim();
}
function httpsUrl(value: unknown, name: string): string {
  const raw = text(value, name, 2048);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException(`Invalid source field: ${name}`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    throw new BadRequestException(`Invalid source field: ${name}`);
  return url.toString();
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid course source object');
  return value as Record<string, unknown>;
}
// The enrichment sidecar is optional so COURSES.json keeps parsing. A
// present sidecar is validated strictly. Only fields marked curated are
// returned; scraped and inferred values stay empty so they cannot satisfy
// publication by themselves.
function provenanceValue(value: unknown, name: string) {
  if (
    value !== 'curated' &&
    value !== 'scraped' &&
    value !== 'inferred' &&
    value !== 'unknown'
  )
    throw new BadRequestException(`Invalid source field: ${name}`);
  return value;
}
function provenance(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid source field: provenance');
  const row = value as Record<string, unknown>;
  return {
    imageUrl: provenanceValue(row.imageUrl, 'provenance.imageUrl'),
    durationMinutes: provenanceValue(
      row.durationMinutes,
      'provenance.durationMinutes',
    ),
    level: provenanceValue(row.level, 'provenance.level'),
    technologyNames: provenanceValue(
      row.technologyNames,
      'provenance.technologyNames',
    ),
  };
}
function optionalImage(value: unknown) {
  if (value == null) return null;
  if (typeof value !== 'string')
    throw new BadRequestException('Invalid source field: imageUrl');
  return httpsUrl(value, 'imageUrl');
}
function optionalMinutes(value: unknown) {
  if (value == null) return null;
  if (
    !Number.isInteger(value) ||
    (value as number) <= 0 ||
    (value as number) > 100000
  )
    throw new BadRequestException('Invalid source field: durationMinutes');
  return value as number;
}
function optionalLevel(value: unknown) {
  if (value == null) return null;
  if (!Object.values(SkillLevel).includes(value as SkillLevel))
    throw new BadRequestException('Invalid source field: level');
  return value as SkillLevel;
}
function readTechnologyNames(value: unknown) {
  if (!Array.isArray(value) || value.length > 50)
    throw new BadRequestException('Invalid source field: technologyNames');
  const seen = new Set<string>();
  const technologyNames: string[] = [];
  for (const name of value) {
    if (typeof name !== 'string')
      throw new BadRequestException('Invalid source field: technologyNames');
    const clean = name.trim();
    if (!clean || clean.length > 100)
      throw new BadRequestException('Invalid source field: technologyNames');
    const folded = clean.toLowerCase();
    if (!seen.has(folded)) {
      seen.add(folded);
      technologyNames.push(clean);
    }
  }
  return technologyNames;
}
function enrichment(value: unknown): SourceEnrichment | null {
  if (value == null) return null;
  const row = object(value);
  const sources = provenance(row.provenance);
  const imageUrl = optionalImage(row.imageUrl);
  const durationMinutes = optionalMinutes(row.durationMinutes);
  const level = optionalLevel(row.level);
  const technologyNames = readTechnologyNames(row.technologyNames);
  return {
    imageUrl: sources.imageUrl === 'curated' ? imageUrl : null,
    durationMinutes:
      sources.durationMinutes === 'curated' ? durationMinutes : null,
    level: sources.level === 'curated' ? level : null,
    technologyNames:
      sources.technologyNames === 'curated' ? technologyNames : [],
  };
}
export function parseCourseSource(input: unknown) {
  const raw = object(input).cursos;
  if (!Array.isArray(raw) || !raw.length || raw.length > 10000)
    throw new BadRequestException(
      'Expected a nonempty cursos array (maximum 10000)',
    );
  const courses: SourceCourse[] = [];
  const seen = new Set<string>();
  let skippedWithoutDevtalles = 0;
  for (const entry of raw) {
    const row = object(entry);
    const platforms = row.plataformas == null ? {} : object(row.plataformas);
    const link = platforms.devtalles ?? row.devtalles;
    if (!link) {
      skippedWithoutDevtalles++;
      continue;
    }
    const url = new URL(text(link, 'plataformas.devtalles', 2048));
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'cursos.devtalles.com' ||
      !url.pathname.startsWith('/courses/') ||
      !url.pathname.slice('/courses/'.length) ||
      url.username ||
      url.password ||
      url.port
    )
      throw new BadRequestException('Expected an HTTPS DevTalles course URL');
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/$/, '');
    const key = `devtalles:${url.toString()}`;
    if (seen.has(key))
      throw new BadRequestException(`Duplicate course source: ${url}`);
    seen.add(key);
    courses.push({
      key,
      url: url.toString(),
      title: text(row.titulo, 'titulo', 200),
      description: text(row.descripcion, 'descripcion', 10000),
      instructor: text(row.instructor, 'instructor', 150),
      category: text(row.categoria, 'categoria', 100),
      enrichment: enrichment(row.enrichment),
    });
  }
  return { courses, skippedWithoutDevtalles };
}
export function publicationPreview(courses: SourceCourse[]) {
  const curatedOnCreate = {
    imageUrl: 0,
    durationMinutes: 0,
    level: 0,
    technologies: 0,
  };
  for (const course of courses) {
    const item = course.enrichment;
    if (item?.imageUrl) curatedOnCreate.imageUrl++;
    if (item?.durationMinutes != null) curatedOnCreate.durationMinutes++;
    if (item?.level) curatedOnCreate.level++;
    if (item?.technologyNames.length) curatedOnCreate.technologies++;
  }
  const missingPublicationFields = (
    [
      ['imageUrl', curatedOnCreate.imageUrl],
      ['durationMinutes', curatedOnCreate.durationMinutes],
      ['level', curatedOnCreate.level],
      ['technologyIds', curatedOnCreate.technologies],
    ] as const
  )
    .filter(([, count]) => count < courses.length)
    .map(([field]) => field);
  return { curatedOnCreate, missingPublicationFields };
}
