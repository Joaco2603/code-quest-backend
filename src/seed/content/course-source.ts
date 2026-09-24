import { BadRequestException } from '@nestjs/common';

export interface SourceCourse {
  key: string;
  title: string;
  description: string;
  instructor: string;
  url: string;
  category: string;
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
    });
  }
  return { courses, skippedWithoutDevtalles };
}
