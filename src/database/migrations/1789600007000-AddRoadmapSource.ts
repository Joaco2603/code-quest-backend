import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRoadmapSource1789600007000 implements MigrationInterface {
  name = 'AddRoadmapSource1789600007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "roadmaps"
      ADD COLUMN "source_roadmap_id" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "roadmaps"
      ADD CONSTRAINT "roadmaps_source_roadmap_id_fkey"
      FOREIGN KEY ("source_roadmap_id") REFERENCES "roadmaps"("id")
      ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "roadmaps_user_source"
      ON "roadmaps" ("user_id", "source_roadmap_id")
      WHERE "source_roadmap_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "roadmaps_user_source"`);
    await queryRunner.query(`
      ALTER TABLE "roadmaps"
      DROP CONSTRAINT "roadmaps_source_roadmap_id_fkey"
    `);
    await queryRunner.query(`
      ALTER TABLE "roadmaps" DROP COLUMN "source_roadmap_id"
    `);
  }
}
