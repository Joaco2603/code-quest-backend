import { BadRequestException } from '@nestjs/common';
import { isURL } from 'class-validator';
import { SkillLevel } from '../../catalog/entities/catalog.entities.js';

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
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid course source object');
  return value as Record<string, unknown>;
}
// Flat curation fields live on the course itself: level, technologyNames,
// imageUrl and durationMinutes are the curated truth and are copied on
// create (or used to fill empty fields with --fill-missing). Raw scrape
// metadata (durationHoursRaw, lessonsRaw) stays on the record for reference
// but is never copied: durations are never inferred from lessons and images
// or technologies are never invented.
//
// NOTE: this validation checks format only (same constraints as the catalog
// DTOs: IsUrl http/https + MaxLength 2048, IsInt 1..1000000). A value passing
// here can still be wrong (moved image, mistyped duration): verify against
// the official course page before publishing. Absent fields stay null and are
// reported as pending; present-but-invalid values reject the whole file
// before anything is written.
function enrichment(row: Record<string, unknown>): SourceEnrichment | null {
  if (
    row.level == null &&
    row.technologyNames == null &&
    row.imageUrl == null &&
    row.durationMinutes == null
  )
    return null;
  return {
    imageUrl: optionalImageUrl(row.imageUrl),
    durationMinutes: optionalDurationMinutes(row.durationMinutes),
    level: optionalLevel(row.level),
    technologyNames: readTechnologyNames(row.technologyNames ?? []),
  };
}
function optionalImageUrl(value: unknown) {
  if (value == null) return null;
  if (typeof value !== 'string')
    throw new BadRequestException('Invalid source field: imageUrl');
  const clean = value.trim();
  if (
    !clean ||
    clean.length > 2048 ||
    !isURL(clean, { protocols: ['http', 'https'], require_protocol: true })
  )
    throw new BadRequestException('Invalid source field: imageUrl');
  return clean;
}
function optionalDurationMinutes(value: unknown) {
  if (value == null) return null;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 1000000
  )
    throw new BadRequestException('Invalid source field: durationMinutes');
  return value;
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
      enrichment: enrichment(row),
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
