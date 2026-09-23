import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameUserResponsesToUserAnswers1789600003000 implements MigrationInterface {
  name = 'RenameUserResponsesToUserAnswers1789600003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_responses" RENAME TO "user_answers"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_answers" RENAME CONSTRAINT "PK_user_responses_id" TO "PK_user_answers_id"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_user_responses_assessment_id" RENAME TO "IDX_user_answers_assessment_id"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_user_responses_question_id" RENAME TO "IDX_user_answers_question_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_answers" RENAME CONSTRAINT "FK_user_responses_assessment_id" TO "FK_user_answers_assessment_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_answers" RENAME CONSTRAINT "FK_user_responses_question_id" TO "FK_user_answers_question_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_answers" RENAME CONSTRAINT "FK_user_responses_answer_option_id" TO "FK_user_answers_answer_option_id"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_answers" RENAME CONSTRAINT "FK_user_answers_answer_option_id" TO "FK_user_responses_answer_option_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_answers" RENAME CONSTRAINT "FK_user_answers_question_id" TO "FK_user_responses_question_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_answers" RENAME CONSTRAINT "FK_user_answers_assessment_id" TO "FK_user_responses_assessment_id"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_user_answers_question_id" RENAME TO "IDX_user_responses_question_id"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_user_answers_assessment_id" RENAME TO "IDX_user_responses_assessment_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_answers" RENAME CONSTRAINT "PK_user_answers_id" TO "PK_user_responses_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_answers" RENAME TO "user_responses"`,
    );
  }
}
