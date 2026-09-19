import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One-to-one threads between a student and an admin. A broadcast (Phase E's
 * "compose") fans out into one `conversations` row per recipient rather than
 * one shared thread, so every reply stays private between that pair.
 */
export class Messaging1757004000000 implements MigrationInterface {
  name = 'Messaging1757004000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "conversations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "studentId" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
        "adminId" uuid NOT NULL REFERENCES "admins"("id") ON DELETE CASCADE,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "conversations_student_idx" ON "conversations" ("studentId");
      CREATE INDEX "conversations_admin_idx" ON "conversations" ("adminId");
      CREATE UNIQUE INDEX "conversations_participants_idx" ON "conversations" ("studentId", "adminId");
    `);

    await queryRunner.query(`
      CREATE TABLE "messages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "conversationId" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
        "senderType" text NOT NULL,
        "body" text NOT NULL,
        "readAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "messages_conversation_idx" ON "messages" ("conversationId");
    `);

    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "description") VALUES
        ('messaging.manage', 'Compose a message to a targeted or broadcast audience of students');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "permissions" WHERE "key" = 'messaging.manage';`);
    await queryRunner.query(`DROP TABLE IF EXISTS "messages";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversations";`);
  }
}
