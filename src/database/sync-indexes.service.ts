import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ENV } from '../common/config/config.module';
import type { Env } from '../common/config/env.schema';

/** TypeORM cannot represent GIN/operator-class indexes. Recreate any indexes
 * lost when it rebuilds a generated column during opt-in schema sync. */
@Injectable()
export class SyncIndexesService implements OnModuleInit {
  constructor(private readonly db: DataSource, @Inject(ENV) private readonly env: Env) {}
  async onModuleInit(): Promise<void> {
    if (!this.env.DATABASE_SYNCHRONIZE) return;
    for (const sql of INDEXES) await this.db.query(sql);
  }
}
const INDEXES = [
  `CREATE INDEX IF NOT EXISTS "institutions_country_idx" ON "institutions" ("countryCode");`,
  `CREATE INDEX IF NOT EXISTS "institutions_status_idx" ON "institutions" ("status");`,
  `CREATE INDEX IF NOT EXISTS "courses_institution_idx" ON "courses" ("institutionId");`,
  `CREATE INDEX IF NOT EXISTS "courses_level_idx" ON "courses" ("level");`,
  `CREATE INDEX IF NOT EXISTS "courses_status_idx" ON "courses" ("status");`,
  `CREATE INDEX IF NOT EXISTS "courses_disciplines_idx" ON "courses" USING gin ("disciplines");`,
  `CREATE INDEX IF NOT EXISTS "articles_country_idx" ON "articles" ("countryCode");`,
  `CREATE INDEX IF NOT EXISTS "articles_status_idx" ON "articles" ("status");`,
  `CREATE INDEX IF NOT EXISTS "articles_tags_idx" ON "articles" USING gin ("tags");`,
  `CREATE INDEX IF NOT EXISTS "institutions_search_idx" ON "institutions" USING gin ("searchVector");`,
  `CREATE INDEX IF NOT EXISTS "institutions_name_trgm_idx" ON "institutions" USING gin ("name" gin_trgm_ops);`,
  `CREATE INDEX IF NOT EXISTS "courses_search_idx" ON "courses" USING gin ("searchVector");`,
  `CREATE INDEX IF NOT EXISTS "courses_title_trgm_idx" ON "courses" USING gin ("title" gin_trgm_ops);`,
  `CREATE INDEX IF NOT EXISTS "articles_search_idx" ON "articles" USING gin ("searchVector");`,
  `CREATE INDEX IF NOT EXISTS "institutions_browse_idx" ON "institutions" ("status", "countryCode", "name");`,
  `CREATE INDEX IF NOT EXISTS "institutions_country_count_idx" ON "institutions" ("status", "countryCode");`,
  `CREATE INDEX IF NOT EXISTS "institutions_enriched_idx" ON "institutions" ("enrichedAt") WHERE "enrichedAt" IS NULL;`,
  `CREATE INDEX IF NOT EXISTS "institutions_source_url_idx" ON "institutions" ("sourceUrl");`,
];
