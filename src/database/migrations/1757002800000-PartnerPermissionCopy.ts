import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Copy only — the permission keys and the `tenants` table stay as they are
 * (renaming those touches RLS, 15+ foreign keys, and the admin API surface,
 * a separate and much larger change). "Tenant" was always agency-speak for
 * what the product now calls a partner; this brings the sentence an admin
 * actually reads in the permissions editor in line with that, without
 * touching the identifier underneath it.
 */
const REWORDED: readonly { key: string; description: string }[] = [
  { key: 'tenants.view', description: 'View partner agencies and their vetting status' },
  { key: 'tenants.approve', description: 'Approve a pending partner, or reinstate a suspended one' },
  { key: 'tenants.suspend', description: 'Suspend an active partner' },
  { key: 'applications.view', description: 'View applications across every partner' },
  {
    key: 'students.view',
    description: "View students and their applicant profiles across every partner",
  },
];

const PREVIOUS: readonly { key: string; description: string }[] = [
  { key: 'tenants.view', description: 'View agency tenants and their vetting status' },
  { key: 'tenants.approve', description: 'Approve a pending tenant, or reinstate a suspended one' },
  { key: 'tenants.suspend', description: 'Suspend an active tenant' },
  { key: 'applications.view', description: 'View applications across every tenant' },
  {
    key: 'students.view',
    description: "View students and their applicant profiles across every tenant",
  },
];

export class PartnerPermissionCopy1757002800000 implements MigrationInterface {
  name = 'PartnerPermissionCopy1757002800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { key, description } of REWORDED) {
      await queryRunner.query(`UPDATE "permissions" SET "description" = $1 WHERE "key" = $2`, [
        description,
        key,
      ]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { key, description } of PREVIOUS) {
      await queryRunner.query(`UPDATE "permissions" SET "description" = $1 WHERE "key" = $2`, [
        description,
        key,
      ]);
    }
  }
}
