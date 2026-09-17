import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateQuestions1789600001000 implements MigrationInterface {
  name = 'CreateQuestions1789600001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "question_type" AS ENUM ('single_choice', 'multiple_choice', 'text', 'number', 'boolean')`,
    );

    await queryRunner.query(`
      CREATE TABLE "questionnaires" (
        "id" SERIAL PRIMARY KEY,
        "title" character varying NOT NULL,
        "description" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "questions" (
        "id" SERIAL PRIMARY KEY,
        "questionnaire_id" integer NOT NULL,
        "question" text NOT NULL,
        "type" "question_type" NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL,
        CONSTRAINT "FK_questions_questionnaire" FOREIGN KEY ("questionnaire_id")
          REFERENCES "questionnaires"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_questions_questionnaire_sort" ON "questions" ("questionnaire_id", "sort_order")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_questions_questionnaire_active" ON "questions" ("questionnaire_id", "is_active")`,
    );

    await queryRunner.query(`
      CREATE TABLE "answer_options" (
        "id" SERIAL PRIMARY KEY,
        "question_id" integer NOT NULL,
        "label" character varying NOT NULL,
        "value" character varying,
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "FK_answer_options_question" FOREIGN KEY ("question_id")
          REFERENCES "questions"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_answer_options_question" ON "answer_options" ("question_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "answer_options"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "questions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "questionnaires"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "question_type"`);
  }
}
