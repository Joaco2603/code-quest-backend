import type { MigrationInterface, QueryRunner } from 'typeorm';

const SEEDED_TITLE = 'Tu próxima ruta de aprendizaje';
const SEEDED_DESCRIPTION =
  'Cuatro preguntas iniciales y hasta tres autoevaluaciones según tus intereses.';

/** The adaptive seed stays as history, but it has no evaluation config. */
export class DeactivateAdaptiveQuestionnaire1789948804000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `UPDATE questionnaires SET is_active = false WHERE title = $1 AND description = $2`,
      [SEEDED_TITLE, SEEDED_DESCRIPTION],
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      `UPDATE questionnaires SET is_active = true WHERE title = $1 AND description = $2`,
      [SEEDED_TITLE, SEEDED_DESCRIPTION],
    );
  }
}
