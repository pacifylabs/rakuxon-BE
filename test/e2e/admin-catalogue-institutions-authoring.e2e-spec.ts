import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { createTestApp } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';

describe('admin: catalogue institutions authoring', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);
    await dataSource.query('TRUNCATE TABLE "courses", "institutions" CASCADE');
  });

  afterAll(async () => {
    await dataSource.query('TRUNCATE TABLE "courses", "institutions" CASCADE');
    await app.close();
  });

  const uniqueSlug = () => `probe-institution-${Math.random().toString(36).slice(2, 10)}`;

  it('creates a draft institution with just the required fields', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.publish']);
    const slug = uniqueSlug();

    const response = await request(app.getHttpServer())
      .post('/v1/admin/catalogue/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug, name: 'Probe University', country: 'United Kingdom', countryCode: 'GB' })
      .expect(201);

    expect(response.body).toMatchObject({
      slug,
      name: 'Probe University',
      countryCode: 'GB',
      status: 'draft',
      highlights: [],
      campuses: [],
      faqs: [],
    });
  });

  it('rejects a duplicate slug on create', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.publish']);
    const slug = uniqueSlug();

    await request(app.getHttpServer())
      .post('/v1/admin/catalogue/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug, name: 'First', country: 'United Kingdom', countryCode: 'GB' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/admin/catalogue/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug, name: 'Second', country: 'United Kingdom', countryCode: 'GB' })
      .expect(409);
  });

  it('updates core fields and a plain string array without touching the rest', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.view', 'catalogue.publish']);
    const created = await request(app.getHttpServer())
      .post('/v1/admin/catalogue/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: uniqueSlug(), name: 'Original Name', country: 'United Kingdom', countryCode: 'GB' })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/v1/admin/catalogue/institutions/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motto: 'Ad astra', highlights: ['Top 10 in the country', 'Strong alumni network'] })
      .expect(200);

    expect(updated.body).toMatchObject({
      name: 'Original Name', // untouched by the PATCH
      motto: 'Ad astra',
      highlights: ['Top 10 in the country', 'Strong alumni network'],
    });
  });

  it('round-trips every jsonb array shape', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.publish']);
    const created = await request(app.getHttpServer())
      .post('/v1/admin/catalogue/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: uniqueSlug(), name: 'Shapes University', country: 'United Kingdom', countryCode: 'GB' })
      .expect(201);

    const payload = {
      campuses: [{ name: 'Main Campus', city: 'London', countryCode: 'GB' }],
      requiredDocuments: [
        { id: 'academic', label: 'Academic', items: [{ name: 'Transcript', minPercentage: 60 }] },
      ],
      englishTests: [{ test: 'IELTS', minScore: '6.5' }],
      faqs: [{ question: 'Is housing guaranteed?', answer: 'For first years, yes.' }],
      qualityRatings: [{ scheme: 'TEF', level: 'Gold', year: 2023 }],
    };

    const updated = await request(app.getHttpServer())
      .patch(`/v1/admin/catalogue/institutions/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(200);

    expect(updated.body.campuses).toEqual(payload.campuses);
    expect(updated.body.requiredDocuments).toEqual(payload.requiredDocuments);
    expect(updated.body.englishTests).toEqual(payload.englishTests);
    expect(updated.body.faqs).toEqual(payload.faqs);
    expect(updated.body.qualityRatings).toEqual(payload.qualityRatings);
  });

  it('rejects an english test with an unknown test name', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.publish']);
    const created = await request(app.getHttpServer())
      .post('/v1/admin/catalogue/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: uniqueSlug(), name: 'Validation University', country: 'United Kingdom', countryCode: 'GB' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/v1/admin/catalogue/institutions/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ englishTests: [{ test: 'NOT-A-REAL-TEST', minScore: '6.5' }] })
      .expect(400);
  });

  it('refuses to create or update without catalogue.publish', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.view']);

    await request(app.getHttpServer())
      .post('/v1/admin/catalogue/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: uniqueSlug(), name: 'x', country: 'y', countryCode: 'GB' })
      .expect(403);
  });

  it('404s for an unknown institution id on detail and update', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.view', 'catalogue.publish']);
    const missingId = '00000000-0000-0000-0000-000000000099';

    await request(app.getHttpServer())
      .get(`/v1/admin/catalogue/institutions/${missingId}/detail`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/v1/admin/catalogue/institutions/${missingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'x' })
      .expect(404);
  });
});
