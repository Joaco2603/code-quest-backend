import 'reflect-metadata';
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../../config/database.js';
import { parseCourseSource, publicationPreview } from './course-source.js';
import { importInitialContent, planImportContent } from './initial-content.js';

const usage =
  'Usage: pnpm content:import <COURSES.enriched.json> [--apply] [--plan] [--fill-missing] [--publish-ready]';

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const plan = args.includes('--plan');
  const fillMissing = args.includes('--fill-missing');
  const publishReady = args.includes('--publish-ready');
  const paths = args.filter((arg) => !arg.startsWith('--'));
  if (paths.length !== 1 || (apply && plan)) throw new Error(usage);
  if ((fillMissing || publishReady) && !apply && !plan)
    throw new Error(
      `${usage}\n--fill-missing and --publish-ready need --plan (preview) or --apply (write)`,
    );
  const { courses, skippedWithoutDevtalles } = parseCourseSource(
    JSON.parse(await readFile(paths[0], 'utf8')),
  );
  const preview = {
    eligibleCourses: courses.length,
    skippedWithoutDevtalles,
    categories: [...new Set(courses.map((c) => c.category))],
    status: 'draft',
    ...publicationPreview(courses),
  };
  if (!apply && !plan) {
    // Offline dry-run: validates the file, never touches the database.
    console.log(JSON.stringify({ mode: 'dry-run', ...preview }, null, 2));
    return;
  }
  const db = new DataSource({
    ...databaseOptions(),
    migrationsRun: false,
    logging: false,
  });
  try {
    await db.initialize();
    if (plan) {
      // Read-only plan over live state: SELECTs only, no lock, no writes.
      // --apply is still required to write; apply re-reads inside its
      // own transaction, so a plan can be stale by then.
      const { entries } = await planImportContent(db.manager, courses, {
        fillMissing,
        publishReady,
      });
      const summarize = (action: string) =>
        entries.filter((entry) => entry.action === action).length;
      console.log(
        JSON.stringify(
          {
            mode: 'plan',
            ...preview,
            fillMissing,
            publishReady,
            toCreate: summarize('create'),
            toLink: summarize('link'),
            toSkipMarker: summarize('skip-marker'),
            ambiguous: summarize('ambiguous'),
            markerOrphan: summarize('marker-orphan'),
            wouldFill: entries.filter((entry) => entry.fillFields.length)
              .length,
            wouldPublish: entries.filter(
              (entry) => entry.publish === 'would-publish',
            ).length,
            entries,
          },
          null,
          2,
        ),
      );
      return;
    }
    if (await db.showMigrations())
      throw new Error(
        'Pending migrations: run pnpm migration:run before importing',
      );
    console.log(
      JSON.stringify(
        {
          mode: 'apply',
          ...preview,
          fillMissing,
          publishReady,
          ...(await importInitialContent(db, courses, {
            fillMissing,
            publishReady,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    if (db.isInitialized) await db.destroy();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Import failed');
  process.exitCode = 1;
});
