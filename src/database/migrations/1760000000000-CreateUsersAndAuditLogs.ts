import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersAndAuditLogs1760000000000 implements MigrationInterface {
  name = 'CreateUsersAndAuditLogs1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'client', 'user');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    if (!(await queryRunner.hasTable('users'))) {
      await queryRunner.query(`
        CREATE TABLE "users" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "email" text NOT NULL,
          "discordId" text,
          "password" text,
          "first_name" text NOT NULL,
          "last_name" text,
          "address" text,
          "isActive" boolean NOT NULL DEFAULT true,
          "role" "public"."users_role_enum" NOT NULL DEFAULT 'user',
          "client_id" uuid,
          "two_factor_secret" character varying,
          "is_two_factor_enabled" boolean NOT NULL DEFAULT false,
          "is_two_factor_pending" boolean NOT NULL DEFAULT false,
          "mustChangePassword" boolean NOT NULL DEFAULT true,
          CONSTRAINT "UQ_users_email" UNIQUE ("email"),
          CONSTRAINT "UQ_users_discordId" UNIQUE ("discordId"),
          CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
          CONSTRAINT "FK_users_client_id" FOREIGN KEY ("client_id")
            REFERENCES "users"("id") ON DELETE SET NULL
        )
      `);
    }

    if (!(await queryRunner.hasTable('audit_logs'))) {
      await queryRunner.query(`
        CREATE TABLE "audit_logs" (
          "id" BIGSERIAL NOT NULL,
          "request_id" character varying(64),
          "user_id" uuid,
          "user_role" character varying(64),
          "method" character varying(16) NOT NULL,
          "path" text NOT NULL,
          "status_code" smallint NOT NULL,
          "outcome" character varying(32) NOT NULL,
          "event_type" character varying(64) NOT NULL,
          "ip" character varying(64),
          "user_agent" text,
          "duration_ms" integer,
          "message" text,
          "metadata" jsonb,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "PK_audit_logs_id" PRIMARY KEY ("id")
        )
      `);
    }

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_created_at" ON "audit_logs" ("created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_request_id" ON "audit_logs" ("request_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_user_id" ON "audit_logs" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_method_path" ON "audit_logs" ("method", "path")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."users_role_enum"`);
  }
}
