import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The client's clock-in/out attendance mechanism for Rakuxon's own admin
 * staff — one row per admin per calendar day (server UTC).
 */
export class Attendance1757004400000 implements MigrationInterface {
  name = 'Attendance1757004400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "attendance_records" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "adminId" uuid NOT NULL REFERENCES "admins"("id") ON DELETE RESTRICT,
        "date" date NOT NULL,
        "clockInAt" timestamptz NOT NULL,
        "clockOutAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "attendance_records_adminId_date_idx" ON "attendance_records" ("adminId", "date");
    `);

    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "description") VALUES
        ('attendance.view', 'View the team clock-in/out attendance log');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "permissions" WHERE "key" = 'attendance.view';`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_records";`);
  }
}
