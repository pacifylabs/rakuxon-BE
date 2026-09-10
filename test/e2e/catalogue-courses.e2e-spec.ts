import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { createTestApp } from '../helpers/create-test-app';

describe('catalogue courses', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);

    await dataSource.query('TRUNCATE TABLE "articles", "courses", "institutions" CASCADE');
    await dataSource.query(`
      INSERT INTO institutions (slug,name,aka,country,"countryCode",city,status,"fastTrackOffer") VALUES
        ('probe-manchester','University of Manchester','{}','United Kingdom','GB','Manchester','published',false),
        ('probe-toronto','University of Toronto','{}','Canada','CA','Toronto','published',false),
        ('probe-hidden','Secret Academy','{}','Canada','CA','Ottawa','draft',false);
      INSERT INTO courses (slug,"institutionId",title,level,disciplines,"durationMonths","tuitionAmount","tuitionCurrency",overview,status)
        SELECT 'probe-data-science', id, 'MSc Data Science', 'postgraduate', '{Computing,Data Science}', 12, 18500.00, 'GBP', 'x', 'published'
        FROM institutions WHERE slug='probe-manchester';
      INSERT INTO courses (slug,"institutionId",title,level,disciplines,"durationMonths",overview,status)
        SELECT 'probe-draft-course', id, 'MSc Draft', 'postgraduate', '{Computing}', 12, 'x', 'draft'
        FROM institutions WHERE slug='probe-manchester';
      INSERT INTO courses (slug,"institutionId",title,level,disciplines,"durationMonths",overview,status)
        SELECT 'probe-bsc-business', id, 'BSc Business', 'undergraduate', '{Business}', 36, 'x', 'published'
        FROM institutions WHERE slug='probe-toronto';
      INSERT INTO courses (slug,"institutionId",title,level,disciplines,"durationMonths",overview,status)
        SELECT 'probe-hidden-course', id, 'MSc Hidden', 'postgraduate', '{Computing}', 12, 'x', 'published'
        FROM institutions WHERE slug='probe-hidden';
    `);
  });

  afterAll(async () => {
    await dataSource.query('TRUNCATE TABLE "articles", "courses", "institutions" CASCADE');
    await app.close();
  });

  const get = (path: string) => request(app.getHttpServer()).get(`/v1/catalogue${path}`);

  it('never returns a course at a draft institution, even when the course itself is published', async () => {
    const { body } = await get('/courses').expect(200);
    const titles = body.items.map((row: { title: string }) => row.title);
    expect(titles).not.toContain('MSc Hidden');
  });

  it('never returns a draft course', async () => {
    const { body } = await get('/courses').expect(200);
    const titles = body.items.map((row: { title: string }) => row.title);
    expect(titles).not.toContain('MSc Draft');
  });

  it('joins the institution onto every row', async () => {
    const { body } = await get('/courses?q=Data Science').expect(200);
    expect(body.items[0]).toMatchObject({
      title: 'MSc Data Science',
      institutionName: 'University of Manchester',
      institutionSlug: 'probe-manchester',
      country: 'United Kingdom',
      countryCode: 'GB',
      tuitionAmount: '18500.00',
      tuitionCurrency: 'GBP',
    });
  });

  it('filters by country', async () => {
    const { body } = await get('/courses?country=CA').expect(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].title).toBe('BSc Business');
  });

  it('filters by level', async () => {
    const { body } = await get('/courses?level=undergraduate').expect(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].title).toBe('BSc Business');
  });

  it('filters by discipline, matching a fragment', async () => {
    const { body } = await get('/courses?discipline=data').expect(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].title).toBe('MSc Data Science');
  });

  it('filters by institution slug', async () => {
    const { body } = await get('/courses?institutionSlug=probe-toronto').expect(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].institutionSlug).toBe('probe-toronto');
  });

  it('matches free text against the course title or the institution name', async () => {
    const { body } = await get('/courses?q=Toronto').expect(200);
    expect(body.items[0].title).toBe('BSc Business');
  });

  it('rejects an unrecognised level', async () => {
    await get('/courses?level=phd').expect(400);
  });

  it('rejects a limit beyond the cap', async () => {
    await get('/courses?limit=5000').expect(400);
  });
});
