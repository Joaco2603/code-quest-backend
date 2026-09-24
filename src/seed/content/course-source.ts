import { BadRequestException } from '@nestjs/common';
import { SkillLevel } from '../catalog/entities.js';

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
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    throw new BadRequestException(`Invalid source field: ${name}`);
  return url.toString();
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid course source object');
  return value as Record<string, unknown>;
}
// The enrichment sidecar is optional so the original COURSES.json keeps
// parsing. When present it is validated strictly: curated data must fail
// fast here, never silently land as nulls in the database.
function enrichment(value: unknown): SourceEnrichment | null {
  if (value == null) return null;
  const row = object(value);
  const image = row.imageUrl;
  const minutes = row.durationMinutes;
  const level = row.level;
  const names = row.technologyNames;
  if (image != null && typeof image !== 'string')
    throw new BadRequestException('Invalid source field: imageUrl');
  if (
    minutes != null &&
    (!Number.isInteger(minutes) ||
      (minutes as number) <= 0 ||
      (minutes as number) > 100000)
  )
    throw new BadRequestException('Invalid source field: durationMinutes');
  if (
    level != null &&
    !Object.values(SkillLevel).includes(level as SkillLevel)
  )
    throw new BadRequestException('Invalid source field: level');
  if (!Array.isArray(names) || names.length > 50)
    throw new BadRequestException('Invalid source field: technologyNames');
  const seen = new Set<string>();
  const technologyNames: string[] = [];
  for (const name of names) {
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
  return {
    imageUrl: image == null ? null : httpsUrl(image, 'imageUrl'),
    durationMinutes: minutes as number | null,
    level: level as SkillLevel | null,
    technologyNames,
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
