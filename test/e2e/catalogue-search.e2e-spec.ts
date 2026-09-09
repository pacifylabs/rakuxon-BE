import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { createTestApp } from '../helpers/create-test-app';

/**
 * Search against a real Postgres. The ranking lives in SQL — tsvector weights,
 * trigram similarity, a UNION across three tables — so a mock would assert
 * nothing that matters.
 */
describe('catalogue search', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);

    await dataSource.query('TRUNCATE TABLE "articles", "courses", "institutions" CASCADE');
    await dataSource.query(`
      INSERT INTO institutions (slug,name,aka,country,"countryCode",city,status) VALUES
        ('probe-manchester','University of Manchester','{UoM}','United Kingdom','GB','Manchester','published'),
        ('probe-vista','Buena Vista University','{}','United States','US','Storm Lake','published'),
        ('probe-draft','University of Nowhere','{}','United Kingdom','GB','Nowhere','draft');
      INSERT INTO courses (slug,"institutionId",title,level,"durationMonths",overview,disciplines,status)
        SELECT 'probe-course', id, 'MSc Data Science', 'postgraduate', 12, 'Applied data science.',
               '{Computer science}', 'published'
        FROM institutions WHERE slug='probe-manchester';
      INSERT INTO articles (slug,title,body,excerpt,"countryCode",status) VALUES
        ('probe-article','The UK student visa, step by step','Body.','A walkthrough.','GB','published'),
        ('probe-funds','Proof of funds','Most refusals turn on the visa evidence, not the balance.','What is checked.',null,'published');
    `);
  });

  afterAll(async () => {
    await dataSource.query('TRUNCATE TABLE "articles", "courses", "institutions" CASCADE');
    await app.close();
  });

  const search = (query: string, limit?: number) =>
    request(app.getHttpServer())
      .get('/v1/catalogue/search')
      .query({ query, ...(limit ? { limit } : {}) });

  it('is public, because it feeds the marketing site', async () => {
    await search('manchester').expect(200);
  });

  it('matches a half-typed word, which is what a typeahead sends', async () => {
    const { body } = await search('manches').expect(200);
    expect(body.items.map((item: { name: string }) => item.name)).toContain(
      'University of Manchester',
    );
  });

  it('tolerates a typo', async () => {
    const { body } = await search('manchestr').expect(200);
    expect(body.total).toBeGreaterThan(0);
  });

  it('finds a university by the abbreviation people actually use', async () => {
    // Without `aka` in the search vector this returns nothing, which is the
    // most common way a typeahead disappoints someone.
    const { body } = await search('UoM').expect(200);
    expect(body.items[0].name).toBe('University of Manchester');
  });

  it('searches courses and articles in the same ranked list', async () => {
    const course = await search('data science').expect(200);
    expect(course.body.items[0].type).toBe('course');

    const article = await search('visa').expect(200);
    expect(article.body.items[0].type).toBe('article');
  });

  it('puts the university above its own courses for a name query', async () => {
    const { body } = await search('manchester').expect(200);
    expect(body.items[0].type).toBe('institution');
  });

  it('ranks a body match above a fuzzy near-match on a name', async () => {
    // "Proof of funds" contains "visa" in its text and nowhere in its title,
    // so trigram similarity against the title scores near zero while
    // "Buena Vista" scores high. Summing ts_rank (0.0-0.1) with
    // word_similarity (0.0-1.0) therefore put every Vista above it — the two
    // signals were never on the same scale.
    const { body } = await search('visa').expect(200);
    const order = body.items.map((item: { slug: string }) => item.slug);

    expect(order.indexOf('probe-funds')).toBeLessThan(order.indexOf('probe-vista'));
  });

  it('never returns a draft record', async () => {
    // Everything imports as draft; publishing is deliberate. A draft leaking
    // into search is a half-checked fee on a real university.
    const { body } = await search('nowhere').expect(200);
    expect(body.items).toHaveLength(0);
  });

  it('returns nothing for a single character', async () => {
    const { body } = await search('u').expect(200);
    expect(body).toEqual({ items: [], total: 0 });
  });

  it('reports the total separately from the page, so the UI can offer "see all"', async () => {
    const { body } = await search('university', 1).expect(200);
    expect(body.items).toHaveLength(1);
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it('rejects a limit outside the allowed range', async () => {
    await search('university', 500).expect(400);
  });

  it('marks the matched run of each name', async () => {
    const { body } = await search('manches').expect(200);
    const [first] = body.items;
    expect(first.highlight.some((segment: { match: boolean }) => segment.match)).toBe(true);
    expect(
      first.highlight.map((segment: { text: string }) => segment.text).join(''),
    ).toBe(first.name);
  });
});
