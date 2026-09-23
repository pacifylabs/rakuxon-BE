import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A human-readable application code (`R26-0001`) alongside the UUID —
 * something a student can read over the phone and an admin can search for,
 * which a UUID is not. Sequential per calendar year, shared across every
 * tenant: `application_reference_counters` holds one row per year, so
 * issuing the next code is a single atomic upsert with no locking of its
 * own. Existing applications are backfilled here, in creation order, using
 * the same counter — so a fresh database and a migrated one number
 * identically.
 */
export class ApplicationReferenceCode1757004200000 implements MigrationInterface {
  name = 'ApplicationReferenceCode1757004200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "application_reference_counters" (
        "year" integer PRIMARY KEY,
        "lastValue" integer NOT NULL DEFAULT 0
      );
      ALTER TABLE "applications" ADD COLUMN "referenceCode" text;
    `);

    const rows: { id: string; createdAt: Date }[] = await queryRunner.query(
      `SELECT "id", "createdAt" FROM "applications" ORDER BY "createdAt" ASC`,
    );

    const counters = new Map<number, number>();
    for (const row of rows) {
      const year = new Date(row.createdAt).getUTCFullYear();
      const next = (counters.get(year) ?? 0) + 1;
      counters.set(year, next);

      const code = `R${String(year % 100).padStart(2, '0')}-${String(next).padStart(4, '0')}`;
      await queryRunner.query(`UPDATE "applications" SET "referenceCode" = $1 WHERE "id" = $2`, [
        code,
        row.id,
      ]);
    }

    for (const [year, lastValue] of counters) {
      await queryRunner.query(
        `INSERT INTO "application_reference_counters" ("year", "lastValue") VALUES ($1, $2)`,
        [year, lastValue],
      );
    }

    await queryRunner.query(`
      ALTER TABLE "applications" ALTER COLUMN "referenceCode" SET NOT NULL;
      ALTER TABLE "applications" ADD UNIQUE ("referenceCode");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "applications" DROP COLUMN "referenceCode";
      DROP TABLE "application_reference_counters";
    `);
  }
}
