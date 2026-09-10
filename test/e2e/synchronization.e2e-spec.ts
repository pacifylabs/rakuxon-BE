import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp } from '../helpers/create-test-app';

const describeSync = process.env.DATABASE_SYNCHRONIZE === 'true' ? describe : describe.skip;
describeSync('schema synchronization', () => {
  let app: INestApplication;
  let db: DataSource;
  beforeAll(async () => { ({ app } = await createTestApp()); db = app.get(DataSource); });
  afterAll(async () => { await app?.close(); });
  it('preserves migration-owned search columns and indexes plus referential integrity', async () => {
    const columns = await db.query(`SELECT table_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name='searchVector' AND is_generated='ALWAYS'`);
    expect(columns).toHaveLength(3);
    const indexes = await db.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public'
      AND indexname IN ('institutions_search_idx','courses_search_idx','articles_search_idx')`);
    expect(indexes).toHaveLength(3);
    const keys = await db.query(`SELECT conname FROM pg_constraint
      WHERE contype='f' AND connamespace='public'::regnamespace`);
    expect(keys.length).toBeGreaterThanOrEqual(19);
  });
});
