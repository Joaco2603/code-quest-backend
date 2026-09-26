import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Links a generated personal roadmap to the assessment that produced it. */
export class PersonalRoadmaps1789600008000 implements MigrationInterface {
  name = 'PersonalRoadmaps1789600008000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE roadmaps
      ADD COLUMN rationale VARCHAR(500),
      ADD COLUMN assessment_id INTEGER
    `);
    await runner.query(`
      CREATE UNIQUE INDEX "roadmaps_assessment_id_unique"
      ON roadmaps (assessment_id)
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP INDEX "roadmaps_assessment_id_unique"`);
    await runner.query(`
      ALTER TABLE roadmaps
      DROP COLUMN rationale,
      DROP COLUMN assessment_id
    `);
  }
}
