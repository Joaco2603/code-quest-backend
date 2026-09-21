import 'reflect-metadata';
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../config/database.js';
import { parseCourseSource } from './course-source.js';
import { importInitialContent } from './initial-content.js';

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const paths = args.filter((arg) => arg !== '--apply');
  if (paths.length !== 1 || paths[0].startsWith('--'))
    throw new Error('Usage: pnpm content:import <COURSES.json> [--apply]');
  const { courses, skippedWithoutDevtalles } = parseCourseSource(
    JSON.parse(await readFile(paths[0], 'utf8')),
  );
  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        eligibleCourses: courses.length,
        skippedWithoutDevtalles,
        categories: [...new Set(courses.map((c) => c.category))],
        status: 'draft',
        missingPublicationFields: [
          'imageUrl',
          'durationMinutes',
          'level',
          'technologyIds',
        ],
      },
      null,
      2,
    ),
  );
  if (!apply) return;
  const db = new DataSource({
    ...databaseOptions(),
    migrationsRun: false,
    logging: false,
  });
  try {
    await db.initialize();
    if (await db.showMigrations())
      throw new Error(
        'Pending migrations: run pnpm migration:run before importing',
      );
    console.log(
      JSON.stringify(await importInitialContent(db, courses), null, 2),
    );
  } finally {
    if (db.isInitialized) await db.destroy();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Import failed');
  process.exitCode = 1;
});
