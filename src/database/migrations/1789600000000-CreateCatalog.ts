import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCatalog1789600000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TYPE skill_level AS ENUM ('beginner', 'intermediate', 'advanced');
      CREATE TYPE course_status AS ENUM ('draft', 'published', 'archived');
      CREATE TABLE categories (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL CHECK (length(trim(name)) > 0));
      CREATE UNIQUE INDEX categories_name_unique ON categories (lower(trim(name)));
      CREATE TABLE technologies (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL CHECK (length(trim(name)) > 0));
      CREATE UNIQUE INDEX technologies_name_unique ON technologies (lower(trim(name)));
      CREATE TABLE courses (
        id SERIAL PRIMARY KEY, title VARCHAR(200) NOT NULL CHECK (length(trim(title)) > 0),
        description TEXT, url VARCHAR(2048), image_url VARCHAR(2048), duration_minutes INTEGER CHECK (duration_minutes > 0),
        instructor VARCHAR(150), level skill_level, status course_status NOT NULL DEFAULT 'draft',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX courses_status_level ON courses (status, level);
      CREATE TABLE course_categories (
        course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
        PRIMARY KEY (course_id, category_id)
      );
      CREATE INDEX course_categories_category ON course_categories(category_id);
      CREATE TABLE course_technologies (
        course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        technology_id INTEGER NOT NULL REFERENCES technologies(id) ON DELETE RESTRICT,
        PRIMARY KEY (course_id, technology_id)
      );
      CREATE INDEX course_technologies_technology ON course_technologies(technology_id);
      CREATE TABLE course_prerequisites (
        course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        prerequisite_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
        PRIMARY KEY (course_id, prerequisite_id), CHECK (course_id <> prerequisite_id)
      );
      CREATE INDEX course_prerequisites_prerequisite ON course_prerequisites(prerequisite_id);
    `);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE course_prerequisites, course_technologies, course_categories, courses, technologies, categories;
      DROP TYPE course_status; DROP TYPE skill_level;`);
  }
}
