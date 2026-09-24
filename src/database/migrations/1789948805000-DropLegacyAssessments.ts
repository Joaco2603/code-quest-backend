import type { MigrationInterface, QueryRunner } from 'typeorm';

// MVP simplification: legacy attempts are not kept as history. Fresh
// databases create these tables through the old migrations and drop them
// here; databases already carrying legacy rows lose them on upgrade.
export class DropLegacyAssessments1789948805000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE "user_answers"`);
    await runner.query(`DROP TABLE "assessments"`);
  }

  // Recreates the empty tables so migrate/revert/migrate cycles keep working.
  // Legacy rows are not recoverable once dropped.
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE "assessments" (
        "id" SERIAL NOT NULL,
        "user_id" uuid NOT NULL,
        "questionnaire_id" integer NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_assessments_id" PRIMARY KEY ("id")
      )
    `);
    await runner.query(
      `CREATE INDEX "IDX_assessments_user_id" ON "assessments" ("user_id")`,
    );
    await runner.query(
      `CREATE INDEX "IDX_assessments_questionnaire_id" ON "assessments" ("questionnaire_id")`,
    );
    await runner.query(`
      ALTER TABLE "assessments"
      ADD CONSTRAINT "FK_assessments_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
    await runner.query(`
      CREATE TABLE "user_answers" (
        "id" SERIAL NOT NULL,
        "assessment_id" integer NOT NULL,
        "question_id" integer NOT NULL,
        "answer_option_id" integer,
        "value" character varying,
        CONSTRAINT "PK_user_answers_id" PRIMARY KEY ("id")
      )
    `);
    await runner.query(
      `CREATE INDEX "IDX_user_answers_assessment_id" ON "user_answers" ("assessment_id")`,
    );
    await runner.query(
      `CREATE INDEX "IDX_user_answers_question_id" ON "user_answers" ("question_id")`,
    );
    await runner.query(`
      ALTER TABLE "user_answers"
      ADD CONSTRAINT "FK_user_answers_assessment_id"
      FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE
    `);
    await runner.query(`
      ALTER TABLE "assessments"
      ADD CONSTRAINT "FK_assessments_questionnaire_id"
      FOREIGN KEY ("questionnaire_id") REFERENCES "questionnaires"("id") ON DELETE RESTRICT
    `);
    await runner.query(`
      ALTER TABLE "user_answers"
      ADD CONSTRAINT "FK_user_answers_question_id"
      FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT
    `);
    await runner.query(`
      ALTER TABLE "user_answers"
      ADD CONSTRAINT "FK_user_answers_answer_option_id"
      FOREIGN KEY ("answer_option_id") REFERENCES "answer_options"("id") ON DELETE RESTRICT
    `);
  }
}
