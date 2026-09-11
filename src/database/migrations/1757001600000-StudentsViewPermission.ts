import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Admin can now look up a student's applicant profile — a new capability, a new key. */
export class StudentsViewPermission1757001600000 implements MigrationInterface {
  name = 'StudentsViewPermission1757001600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "description") VALUES
        ('students.view', 'View students and their applicant profiles across every tenant');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "key" = 'students.view';
    `);
  }
}
