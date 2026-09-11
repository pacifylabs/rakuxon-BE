import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { createTestApp } from '../helpers/create-test-app';

describe('catalogue institutions', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);

    await dataSource.query('TRUNCATE TABLE "articles", "courses", "institutions" CASCADE');
    await dataSource.query(`
      INSERT INTO institutions (slug,name,aka,country,"countryCode",city,website,status,"fastTrackOffer") VALUES
        ('probe-manchester','University of Manchester','{UoM}','United Kingdom','GB','Manchester','https://man.ac.uk','published',true),
        ('probe-leeds','University of Leeds','{}','United Kingdom','GB','Leeds',null,'published',false),
        ('probe-toronto','University of Toronto','{UofT}','Canada','CA','Toronto',null,'published',false),
        ('probe-hidden','Secret Academy','{}','Canada','CA','Ottawa',null,'draft',false);
      INSERT INTO courses (slug,"institutionId",title,level,"durationMonths",overview,status)
        SELECT 'probe-course-1', id, 'MSc Data Science','postgraduate',12,'x','published'
        FROM institutions WHERE slug='probe-manchester';
      INSERT INTO courses (slug,"institutionId",title,level,"durationMonths",overview,status)
        SELECT 'probe-course-2', id, 'MSc Draft','postgraduate',12,'x','draft'
        FROM institutions WHERE slug='probe-manchester';
      INSERT INTO courses (slug,"institutionId",title,level,"durationMonths",overview,status)
        SELECT 'probe-course-3', id, 'MSc Hidden Host','postgraduate',12,'x','published'
        FROM institutions WHERE slug='probe-hidden';
      UPDATE courses SET "tuitionAmount" = 24800, "tuitionCurrency" = 'GBP', "tuitionIsEstimate" = true
        WHERE slug = 'probe-course-1';
    `);
  });

  afterAll(async () => {
    await dataSource.query('TRUNCATE TABLE "articles", "courses", "institutions" CASCADE');
    await app.close();
  });

  const get = (path: string) => request(app.getHttpServer()).get(`/v1/catalogue${path}`);

  describe('highlights', () => {
    it('derives them from the row when an editor has written none', async () => {
      // Six thousand imported records have no written highlights, and a strip
      // of "world-class facilities" would be a claim with nothing behind it.
      const { body } = await get('/institutions/probe-manchester').expect(200);

      expect(body.highlights).toContain('Based in Manchester, United Kingdom');
    });

    it('leaves highlights an editor wrote alone', async () => {
      await dataSource.query(
        `UPDATE institutions SET highlights = '{"Ranked first for graduate pay"}' WHERE slug='probe-leeds'`,
      );

      try {
        const { body } = await get('/institutions/probe-leeds').expect(200);
        expect(body.highlights).toEqual(['Ranked first for graduate pay']);
      } finally {
        /* Restored even on failure: without this a failing assertion leaves
           the fixture edited and the next test fails for the wrong reason. */
        await dataSource.query(`UPDATE institutions SET highlights = '{}' WHERE slug='probe-leeds'`);
      }
    });
  });

  describe('countries', () => {
    it('counts only published institutions', async () => {
      const { body } = await get('/countries').expect(200);
      const canada = body.find((row: { countryCode: string }) => row.countryCode === 'CA');

      // The draft "Secret Academy" must not inflate the menu, or a country
      // advertises more universities than its own listing will show.
      expect(canada.institutions).toBe(1);
    });

    it('is ordered by country name, so the menu is stable', async () => {
      const { body } = await get('/countries').expect(200);
      const names = body.map((row: { country: string }) => row.country);
      expect(names).toEqual([...names].sort());
    });
  });

  describe('listing', () => {
    it('filters by country', async () => {
      const { body } = await get('/institutions?country=CA').expect(200);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].name).toBe('University of Toronto');
    });

    it('never returns a draft', async () => {
      const { body } = await get('/institutions').expect(200);
      const names = body.items.map((row: { name: string }) => row.name);
      expect(names).not.toContain('Secret Academy');
    });

    it('matches a fragment anywhere in the name, not just a whole word', async () => {
      // A browse filter is not a typeahead: "chester" has to find Manchester.
      const { body } = await get('/institutions?q=chester').expect(200);
      expect(body.items[0].name).toBe('University of Manchester');
    });

    it('matches an acronym', async () => {
      const { body } = await get('/institutions?q=UofT').expect(200);
      expect(body.items[0].name).toBe('University of Toronto');
    });

    it('counts published courses per institution, ignoring drafts', async () => {
      const { body } = await get('/institutions?q=Manchester').expect(200);
      expect(body.items[0].courseCount).toBe(1);
    });

    it('reports zero rather than omitting the count', async () => {
      const { body } = await get('/institutions?q=Leeds').expect(200);
      expect(body.items[0].courseCount).toBe(0);
    });

    it('paginates and reports the page count', async () => {
      const { body } = await get('/institutions?limit=1&page=2').expect(200);
      expect(body.items).toHaveLength(1);
      expect(body.page).toBe(2);
      expect(body.pageCount).toBe(3);
      expect(body.total).toBe(3);
    });

    it('rejects a limit beyond the cap', async () => {
      await get('/institutions?limit=5000').expect(400);
    });

    it('rejects a malformed country code', async () => {
      await get('/institutions?country=BRITAIN').expect(400);
    });
  });

  describe('detail', () => {
    it('returns one university by slug', async () => {
      const { body } = await get('/institutions/probe-manchester').expect(200);
      expect(body.name).toBe('University of Manchester');
      expect(body.aka).toEqual(['UoM']);
    });

    it('404s for a draft rather than revealing it exists', async () => {
      // 403 would confirm the slug is real, which is a probe an anonymous
      // visitor should not be able to run.
      await get('/institutions/probe-hidden').expect(404);
    });

    it('404s for an unknown slug', async () => {
      await get('/institutions/nope').expect(404);
    });
  });

  describe('courses', () => {
    it('counts only published courses on the university, so the count agrees with the list', async () => {
      const { body } = await get('/institutions/probe-manchester').expect(200);
      expect(body.courseCount).toBe(1);
    });

    it('carries the estimate flag with a sourced fee, so the page can say approximate', async () => {
      const { body } = await get('/courses?institutionSlug=probe-manchester').expect(200);

      expect(body.total).toBe(1);
      expect(body.items[0]).toMatchObject({
        slug: 'probe-course-1',
        tuitionAmount: '24800.00',
        tuitionCurrency: 'GBP',
        tuitionIsEstimate: true,
      });
    });

    it('returns one course with its university', async () => {
      const { body } = await get('/courses/probe-course-1').expect(200);

      expect(body).toMatchObject({
        slug: 'probe-course-1',
        title: 'MSc Data Science',
        institutionSlug: 'probe-manchester',
        institutionName: 'University of Manchester',
        tuitionIsEstimate: true,
      });
      expect(body.highlights).toEqual([]);
    });

    it('404s a draft course rather than revealing it exists', async () => {
      await get('/courses/probe-course-2').expect(404);
    });

    it('404s a published course whose university is unpublished', async () => {
      // As unpublished as its host: the course page must not leak a draft university.
      await get('/courses/probe-course-3').expect(404);
    });

    it('404s an unknown course', async () => {
      await get('/courses/no-such-course').expect(404);
    });
  });
});
