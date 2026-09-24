import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAssessments1789948800000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE evaluation_configs (
        questionnaire_id integer PRIMARY KEY REFERENCES questionnaires(id) ON DELETE RESTRICT,
        version integer NOT NULL CHECK (version > 0),
        definition jsonb NOT NULL
      );
      CREATE TABLE self_assessments (
        id SERIAL PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        questionnaire_id integer NOT NULL REFERENCES questionnaires(id) ON DELETE RESTRICT,
        completed_at timestamptz NOT NULL,
        snapshot jsonb NOT NULL,
        profile jsonb NOT NULL
      );
      CREATE INDEX "IDX_self_assessments_user_id" ON self_assessments(user_id, id);
      CREATE INDEX "IDX_self_assessments_questionnaire" ON self_assessments(questionnaire_id);
      CREATE TABLE self_assessment_responses (
        id SERIAL PRIMARY KEY,
        assessment_id integer NOT NULL REFERENCES self_assessments(id) ON DELETE CASCADE,
        question_id integer NOT NULL,
        value jsonb NOT NULL,
        CONSTRAINT "UQ_self_assessment_responses_question" UNIQUE(assessment_id, question_id)
      );
      -- Keep taxonomy IDs valid even after configuration changes. Each row
      -- belongs either to a live configuration or to an immutable assessment.
      CREATE TABLE evaluation_taxonomy_refs (
        id SERIAL PRIMARY KEY,
        questionnaire_id integer REFERENCES evaluation_configs(questionnaire_id) ON DELETE CASCADE,
        assessment_id integer REFERENCES self_assessments(id) ON DELETE CASCADE,
        category_id integer REFERENCES categories(id) ON DELETE RESTRICT,
        technology_id integer REFERENCES technologies(id) ON DELETE RESTRICT,
        CHECK (num_nonnulls(questionnaire_id, assessment_id) = 1),
        CHECK (num_nonnulls(category_id, technology_id) = 1)
      );
      CREATE INDEX ON evaluation_taxonomy_refs(questionnaire_id);
      CREATE INDEX ON evaluation_taxonomy_refs(assessment_id);
      CREATE INDEX ON evaluation_taxonomy_refs(category_id);
      CREATE INDEX ON evaluation_taxonomy_refs(technology_id);
    `);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      `DROP TABLE evaluation_taxonomy_refs; DROP TABLE self_assessment_responses; DROP TABLE self_assessments; DROP TABLE evaluation_configs;`,
    );
  }
}
