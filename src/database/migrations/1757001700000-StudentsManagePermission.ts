import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Admin can now edit a student's applicant profile on their behalf — a stronger capability than `students.view`. */
export class StudentsManagePermission1757001700000 implements MigrationInterface {
  name = 'StudentsManagePermission1757001700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "description") VALUES
        ('students.manage', 'Edit a student''s applicant profile on their behalf');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "key" = 'students.manage';
    `);
  }
}
