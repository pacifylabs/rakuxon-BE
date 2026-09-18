import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two pieces of the same feature: who an application is assigned to, and a
 * durable record of what happened to it (and everything else an admin or
 * student does). `actorType` stays a checked plain column, not a pg enum —
 * this table is written to far more often than any enum-backed one, and a
 * migration to add a fourth actor kind later should not need to touch
 * Postgres enum machinery.
 */
export class AssignmentAndAuditLog1757003400000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE applications ADD COLUMN "assignedAdminId" uuid,
        ADD CONSTRAINT "applications_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES admins(id) ON DELETE SET NULL;
      CREATE INDEX "applications_assignedAdminId_idx" ON applications ("assignedAdminId");

      CREATE TABLE audit_log (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "actorType" text NOT NULL,
        CONSTRAINT "audit_log_actorType_check" CHECK ("actorType" IN ('admin', 'student', 'system')),
        "actorId" uuid,
        "actorName" text,
        action text NOT NULL,
        description text NOT NULL,
        "resourceType" text,
        "resourceId" uuid,
        metadata jsonb NOT NULL DEFAULT '{}',
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "audit_log_resource_idx" ON audit_log ("resourceType", "resourceId");
      CREATE INDEX "audit_log_createdAt_idx" ON audit_log ("createdAt" DESC);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE audit_log;
      ALTER TABLE applications DROP CONSTRAINT "applications_assignedAdminId_fkey", DROP COLUMN "assignedAdminId";
    `);
  }
}
