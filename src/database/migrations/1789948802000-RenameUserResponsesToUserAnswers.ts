import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameUserResponsesToUserAnswers1789948802000
  implements MigrationInterface
{
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE user_responses RENAME TO user_answers;
      ALTER TABLE user_answers
        RENAME CONSTRAINT "UQ_user_responses_question" TO "UQ_user_answers_question";
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE user_answers
        RENAME CONSTRAINT "UQ_user_answers_question" TO "UQ_user_responses_question";
      ALTER TABLE user_answers RENAME TO user_responses;
    `);
  }
}
