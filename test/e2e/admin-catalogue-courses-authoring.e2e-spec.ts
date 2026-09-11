import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { createTestApp } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';

describe('admin: catalogue courses authoring', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let institutionId: string;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);
    await dataSource.query('TRUNCATE TABLE "courses", "institutions" CASCADE');
    await dataSource.query(`
      INSERT INTO institutions (slug, name, aka, country, "countryCode", status) VALUES
        ('probe-course-authoring-institution', 'Probe University', '{}', 'United Kingdom', 'GB', 'published');
    `);
    institutionId = (
      await dataSource.query(`SELECT id FROM institutions WHERE slug = 'probe-course-authoring-institution'`)
    )[0].id;
  });

  afterAll(async () => {
    await dataSource.query('TRUNCATE TABLE "courses", "institutions" CASCADE');
    await app.close();
  });

  const uniqueSlug = () => `probe-course-${Math.random().toString(36).slice(2, 10)}`;

  it('creates a draft course under an institution', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.publish']);
    const slug = uniqueSlug();

    const response = await request(app.getHttpServer())
      .post('/v1/admin/catalogue/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug, institutionId, title: 'MSc Probing', level: 'postgraduate' })
      .expect(201);

    expect(response.body).toMatchObject({
      slug,
      institutionId,
      title: 'MSc Probing',
      level: 'postgraduate',
      status: 'draft',
      intakes: [],
      scholarships: [],
    });
  });

  it('404s creating a course under an unknown institution', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.publish']);

    await request(app.getHttpServer())
      .post('/v1/admin/catalogue/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: uniqueSlug(), institutionId: '00000000-0000-0000-0000-000000000099', title: 'x', level: 'postgraduate' })
      .expect(404);
  });

  it('rejects a duplicate slug on create', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.publish']);
    const slug = uniqueSlug();

    await request(app.getHttpServer())
      .post('/v1/admin/catalogue/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug, institutionId, title: 'First', level: 'postgraduate' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/admin/catalogue/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug, institutionId, title: 'Second', level: 'postgraduate' })
      .expect(409);
  });

  it('round-trips intakes, entryRequirements, englishTests and scholarships', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.view', 'catalogue.publish']);
    const created = await request(app.getHttpServer())
      .post('/v1/admin/catalogue/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: uniqueSlug(), institutionId, title: 'Shapes Course', level: 'postgraduate' })
      .expect(201);

    const payload = {
      intakes: [{ month: 'Sep', year: 2026, status: 'open' }],
      entryRequirements: [{ id: 'academic', label: 'Academic', items: [{ name: 'Degree', minPercentage: 65 }] }],
      englishTests: [{ test: 'TOEFL', minScore: '90' }],
      scholarships: [{ name: 'Merit award', amount: 5000, currency: 'GBP' }],
      tuitionAmount: '18500.00',
      tuitionCurrency: 'GBP',
      durationMonths: 12,
    };

    const updated = await request(app.getHttpServer())
      .patch(`/v1/admin/catalogue/courses/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(200);

    expect(updated.body.intakes).toEqual(payload.intakes);
    expect(updated.body.entryRequirements).toEqual(payload.entryRequirements);
    expect(updated.body.englishTests).toEqual(payload.englishTests);
    expect(updated.body.scholarships).toEqual(payload.scholarships);
    expect(updated.body.tuitionAmount).toBe('18500.00');

    const detail = await request(app.getHttpServer())
      .get(`/v1/admin/catalogue/courses/${created.body.id}/detail`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.intakes).toEqual(payload.intakes);
  });

  it('rejects an intake with an invalid status', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.publish']);
    const created = await request(app.getHttpServer())
      .post('/v1/admin/catalogue/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: uniqueSlug(), institutionId, title: 'Validation Course', level: 'postgraduate' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/v1/admin/catalogue/courses/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ intakes: [{ month: 'Sep', year: 2026, status: 'not-a-real-status' }] })
      .expect(400);
  });

  it('refuses to create or update without catalogue.publish', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.view']);

    await request(app.getHttpServer())
      .post('/v1/admin/catalogue/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: uniqueSlug(), institutionId, title: 'x', level: 'postgraduate' })
      .expect(403);
  });
});
