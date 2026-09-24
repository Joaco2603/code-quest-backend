import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameUserResponsesToUserAnswers1789948802000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE self_assessment_responses RENAME TO self_assessment_answers;
      ALTER TABLE self_assessment_answers
        RENAME CONSTRAINT "UQ_self_assessment_responses_question" TO "UQ_self_assessment_answers_question";
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE self_assessment_answers
        RENAME CONSTRAINT "UQ_self_assessment_answers_question" TO "UQ_self_assessment_responses_question";
      ALTER TABLE self_assessment_answers RENAME TO self_assessment_responses;
    `);
  }
}
