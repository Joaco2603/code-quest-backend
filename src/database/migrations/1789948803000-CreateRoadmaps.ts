import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRoadmaps1789948803000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE roadmaps
        ADD COLUMN rationale VARCHAR(500),
        ADD COLUMN model VARCHAR(64),
        ADD COLUMN assessment_id INTEGER REFERENCES self_assessments(id) ON DELETE SET NULL,
        ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
      CREATE INDEX roadmaps_assessment_id ON roadmaps (assessment_id);
    `);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE roadmaps DROP COLUMN rationale, DROP COLUMN model,
        DROP COLUMN assessment_id, DROP COLUMN created_at;
    `);
  }
}
