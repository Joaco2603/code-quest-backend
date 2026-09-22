import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAssessments1789600002000 implements MigrationInterface {
  name = 'CreateAssessments1789600002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "assessments" (
        "id" SERIAL NOT NULL,
        "user_id" uuid NOT NULL,
        "questionnaire_id" integer NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_assessments_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_assessments_user_id" ON "assessments" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_assessments_questionnaire_id" ON "assessments" ("questionnaire_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "assessments"
      ADD CONSTRAINT "FK_assessments_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE TABLE "user_responses" (
        "id" SERIAL NOT NULL,
        "assessment_id" integer NOT NULL,
        "question_id" integer NOT NULL,
        "answer_option_id" integer,
        "value" character varying,
        CONSTRAINT "PK_user_responses_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_user_responses_assessment_id" ON "user_responses" ("assessment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_responses_question_id" ON "user_responses" ("question_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "user_responses"
      ADD CONSTRAINT "FK_user_responses_assessment_id"
      FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "assessments"
      ADD CONSTRAINT "FK_assessments_questionnaire_id"
      FOREIGN KEY ("questionnaire_id") REFERENCES "questionnaires"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "user_responses"
      ADD CONSTRAINT "FK_user_responses_question_id"
      FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "user_responses"
      ADD CONSTRAINT "FK_user_responses_answer_option_id"
      FOREIGN KEY ("answer_option_id") REFERENCES "answer_options"("id") ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_responses" DROP CONSTRAINT "FK_user_responses_answer_option_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_responses" DROP CONSTRAINT "FK_user_responses_question_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assessments" DROP CONSTRAINT "FK_assessments_questionnaire_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_responses" DROP CONSTRAINT "FK_user_responses_assessment_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_user_responses_question_id"`);
    await queryRunner.query(`DROP INDEX "IDX_user_responses_assessment_id"`);
    await queryRunner.query(`DROP TABLE "user_responses"`);
    await queryRunner.query(
      `ALTER TABLE "assessments" DROP CONSTRAINT "FK_assessments_user_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_assessments_questionnaire_id"`);
    await queryRunner.query(`DROP INDEX "IDX_assessments_user_id"`);
    await queryRunner.query(`DROP TABLE "assessments"`);
  }
}
