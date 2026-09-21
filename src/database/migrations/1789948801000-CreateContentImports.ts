import type { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateContentImports1789948801000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE content_imports (
      source_key text PRIMARY KEY,
      course_id integer UNIQUE REFERENCES courses(id) ON DELETE RESTRICT,
      questionnaire_id integer UNIQUE REFERENCES questionnaires(id) ON DELETE RESTRICT,
      imported_at timestamptz NOT NULL DEFAULT now(),
      CHECK (num_nonnulls(course_id, questionnaire_id) = 1)
    )`);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE content_imports');
  }
}
