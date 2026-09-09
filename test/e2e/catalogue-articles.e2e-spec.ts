import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { createTestApp } from '../helpers/create-test-app';

describe('catalogue articles', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);

    await dataSource.query('TRUNCATE TABLE "articles", "courses", "institutions" CASCADE');
    await dataSource.query(`
      INSERT INTO articles (slug,title,excerpt,body,"countryCode",tags,"readMinutes",author,"publishedAt",status) VALUES
        ('probe-uk-visa','UK visa order','How it goes','# Body one','GB','{visas,united-kingdom}',7,'Rakuxon Editorial','2026-02-25','published'),
        ('probe-funds','Proof of funds','What is checked','# Body two',null,'{visas,finance}',6,'Rakuxon Editorial','2026-02-11','published'),
        ('probe-undated','Undated guidance','No date','# Body three',null,'{choosing}',4,'Rakuxon Editorial',null,'published'),
        ('probe-draft','Draft piece','Hidden','# Body four','GB','{visas,secret-tag}',3,'Rakuxon Editorial','2026-03-01','draft');
    `);
  });

  afterAll(async () => {
    await dataSource.query('TRUNCATE TABLE "articles" CASCADE');
    await app.close();
  });

  const get = (path: string) => request(app.getHttpServer()).get(`/v1/catalogue${path}`);

  describe('listing', () => {
    it('returns only published articles', async () => {
      const { body } = await get('/articles').expect(200);
      const slugs = body.items.map((row: { slug: string }) => row.slug);

      expect(body.total).toBe(3);
      expect(slugs).not.toContain('probe-draft');
    });

    it('orders newest first and puts undated articles last', async () => {
      // Postgres sorts NULLs first on DESC, which would place every undated
      // article above this month's writing.
      const { body } = await get('/articles').expect(200);

      expect(body.items.map((row: { slug: string }) => row.slug)).toEqual([
        'probe-uk-visa',
        'probe-funds',
        'probe-undated',
      ]);
    });

    it('omits the body, which no card renders', async () => {
      const { body } = await get('/articles').expect(200);
      expect(body.items[0]).not.toHaveProperty('body');
    });

    it('filters by destination', async () => {
      const { body } = await get('/articles?country=GB').expect(200);

      expect(body.items).toHaveLength(1);
      expect(body.items[0].slug).toBe('probe-uk-visa');
    });

    it('filters by tag without matching a longer tag that contains it', async () => {
      const { body } = await get('/articles?tag=visas').expect(200);
      expect(body.items.map((row: { slug: string }) => row.slug)).toEqual([
        'probe-uk-visa',
        'probe-funds',
      ]);
    });

    it('offers every published tag, not only the current page', async () => {
      // A filter bar built from the visible rows loses its own options as soon
      // as one of them is used.
      const { body } = await get('/articles?limit=1').expect(200);

      expect(body.items).toHaveLength(1);
      expect(body.tags).toEqual(['choosing', 'finance', 'united-kingdom', 'visas']);
      expect(body.tags).not.toContain('secret-tag');
    });

    it('reports a page count the pager can trust', async () => {
      const { body } = await get('/articles?limit=2').expect(200);
      expect(body).toMatchObject({ total: 3, page: 1, pageCount: 2 });
    });

    it('rejects a limit above the cap rather than serving the whole table', async () => {
      await get('/articles?limit=5000').expect(400);
    });
  });

  describe('detail', () => {
    it('returns the body', async () => {
      const { body } = await get('/articles/probe-funds').expect(200);

      expect(body).toMatchObject({
        slug: 'probe-funds',
        title: 'Proof of funds',
        body: '# Body two',
        tags: ['visas', 'finance'],
      });
    });

    it('404s for a draft, so its existence cannot be probed', async () => {
      await get('/articles/probe-draft').expect(404);
    });

    it('404s for an unknown slug', async () => {
      await get('/articles/no-such-article').expect(404);
    });
  });
});
