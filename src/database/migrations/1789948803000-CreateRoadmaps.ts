import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRoadmaps1789948803000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE roadmaps (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL CHECK (length(trim(title)) > 0),
        rationale VARCHAR(500) NOT NULL CHECK (length(trim(rationale)) > 0),
        model VARCHAR(64) NOT NULL CHECK (length(trim(model)) > 0),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX roadmaps_user_id ON roadmaps (user_id);
      CREATE INDEX roadmaps_assessment_id ON roadmaps (assessment_id);

      CREATE TABLE roadmap_courses (
        id SERIAL PRIMARY KEY,
        roadmap_id INTEGER NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
        course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
        progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
        sort_order INTEGER NOT NULL,
        UNIQUE (roadmap_id, course_id),
        UNIQUE (roadmap_id, sort_order)
      );
      CREATE INDEX roadmap_courses_course_id ON roadmap_courses (course_id);
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE roadmap_courses, roadmaps;`);
  }
}
