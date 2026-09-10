import 'dotenv/config';

import { DataSource } from 'typeorm';

import { PublishStatus } from '../src/contract/enums';
import { buildDataSourceOptions } from '../src/database/data-source';
import { connectWithRetry, withReconnect } from './lib/resilient-db';
import { ARTICLES, AUTHOR } from './content/articles';
import { Article } from '../src/modules/catalogue/entities/article.entity';

/**
 * Publishes the guidance articles held in scripts/content/articles.ts.
 *
 *   pnpm catalogue:seed:articles
 *
 * Upserts on slug, so re-running after an edit updates the row rather than
 * failing on the unique index or creating a second copy. Everything else about
 * an existing row — its id, and therefore any link to it — survives.
 */

async function main(): Promise<void> {
  const dataSource = new DataSource(buildDataSourceOptions());
  await connectWithRetry(dataSource);
  const repo = dataSource.getRepository(Article);

  try {
    let created = 0;
    let updated = 0;

    for (const seed of ARTICLES) {
      const existing = await withReconnect(dataSource, () =>
        repo.findOne({ where: { slug: seed.slug }, select: { id: true } }),
      );

      const row = {
        ...seed,
        publishedAt: new Date(seed.publishedAt),
        author: AUTHOR,
        status: PublishStatus.Published,
        /* Written here, not taken from anywhere. Recorded so the provenance of
           every row in this table is answerable, including our own. */
        source: 'Rakuxon',
        sourceUrl: null,
        heroImageUrl: null,
        retrievedAt: null,
      };

      if (existing) {
        await withReconnect(dataSource, () => repo.update(existing.id, row));
        updated += 1;
      } else {
        await withReconnect(dataSource, () => repo.insert(row));
        created += 1;
      }

      process.stdout.write(`  ${existing ? 'updated' : 'created'}  ${seed.slug}\n`);
    }

    process.stdout.write(`\n${created} created, ${updated} updated.\n`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
