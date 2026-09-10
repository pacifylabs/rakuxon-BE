import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces `users.fullName` with `firstName`/`lastName`.
 *
 * Every registration path (agency, direct student, invited student) collects
 * a name as two fields, not one free-text string — splitting the column keeps
 * the database in step with what the forms actually capture, rather than
 * concatenating on the way in and re-splitting on the way out.
 */
export class SplitUserName1757001100000 implements MigrationInterface {
  name = 'SplitUserName1757001100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN "firstName" text;
      ALTER TABLE "users" ADD COLUMN "lastName" text;
    `);

    /* Best-effort split of existing data: first word vs. the rest, falling
       back to the whole name as the first name when there's only one word. */
    await queryRunner.query(`
      UPDATE "users" SET
        "firstName" = split_part("fullName", ' ', 1),
        "lastName" = COALESCE(NULLIF(substring("fullName" FROM position(' ' IN "fullName") + 1), ''), split_part("fullName", ' ', 1))
      WHERE "fullName" IS NOT NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "firstName" SET NOT NULL;
      ALTER TABLE "users" ALTER COLUMN "lastName" SET NOT NULL;
      ALTER TABLE "users" DROP COLUMN "fullName";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN "fullName" text;
      UPDATE "users" SET "fullName" = trim("firstName" || ' ' || "lastName");
      ALTER TABLE "users" ALTER COLUMN "fullName" SET NOT NULL;
      ALTER TABLE "users" DROP COLUMN "firstName";
      ALTER TABLE "users" DROP COLUMN "lastName";
    `);
  }
}
