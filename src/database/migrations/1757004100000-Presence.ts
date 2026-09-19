import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `lastSeenAt` on the two identity tables, bumped by a polling heartbeat
 * (`common/presence`) rather than any push mechanism — no WebSocket
 * infrastructure exists, so "online" is computed as "seen in the last two
 * minutes" at read time, not tracked as a live boolean.
 */
export class Presence1757004100000 implements MigrationInterface {
  name = 'Presence1757004100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "lastSeenAt" timestamptz;`);
    await queryRunner.query(`ALTER TABLE "admins" ADD COLUMN "lastSeenAt" timestamptz;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "admins" DROP COLUMN IF EXISTS "lastSeenAt";`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "lastSeenAt";`);
  }
}
