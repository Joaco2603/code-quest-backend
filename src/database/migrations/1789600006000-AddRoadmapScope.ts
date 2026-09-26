import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRoadmapScope1789600006000 implements MigrationInterface {
  name = 'AddRoadmapScope1789600006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "roadmap_scope" AS ENUM ('personal', 'global')`,
    );
    await queryRunner.query(`
      ALTER TABLE "roadmaps"
      ADD COLUMN "scope" "roadmap_scope" NOT NULL DEFAULT 'personal'
    `);
    await queryRunner.query(`
      UPDATE "roadmaps" AS roadmap
      SET "scope" = 'global'
      FROM "users" AS owner
      WHERE roadmap.user_id = owner.id
        AND owner.role = 'admin'
    `);
    await queryRunner.query(
      `CREATE INDEX "roadmaps_scope" ON "roadmaps" ("scope")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "roadmaps_scope"`);
    await queryRunner.query(`ALTER TABLE "roadmaps" DROP COLUMN "scope"`);
    await queryRunner.query(`DROP TYPE "roadmap_scope"`);
  }
}
