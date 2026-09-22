import { MigrationInterface, QueryRunner } from 'typeorm';

export class AssessmentGuards1789600004000 implements MigrationInterface {
  name = 'AssessmentGuards1789600004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "assessments" AS newer
      USING "assessments" AS older
      WHERE newer."user_id" = older."user_id"
        AND newer."questionnaire_id" = older."questionnaire_id"
        AND newer."completed_at" IS NULL
        AND older."completed_at" IS NULL
        AND newer."id" > older."id"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_assessments_open_user_questionnaire"
      ON "assessments" ("user_id", "questionnaire_id")
      WHERE "completed_at" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "answer_options"
      ADD COLUMN "is_active" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "answer_options" DROP COLUMN "is_active"
    `);
    await queryRunner.query(`
      DROP INDEX "UQ_assessments_open_user_questionnaire"
    `);
  }
}
