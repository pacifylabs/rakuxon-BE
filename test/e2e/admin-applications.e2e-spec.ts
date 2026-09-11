import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { createTestApp, truncateIdentity } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';

describe('admin: applications', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let applicationId: string;
  let tenantId: string;

  async function registerStudent() {
    const { body } = await request(app.getHttpServer())
      .post('/v1/auth/register/student')
      .send({
        email: `student-${Math.random().toString(36).slice(2, 8)}@example.com`,
        firstName: 'Grace',
        lastName: 'Hopper',
        password: 'correct-horse-battery',
      })
      .expect(201);
    return body;
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);

    const session = await registerStudent();
    tenantId = session.user.tenantId;

    await dataSource.query('TRUNCATE TABLE "courses", "institutions" CASCADE');
    await dataSource.query(`
      INSERT INTO institutions (slug, name, aka, country, "countryCode", status) VALUES
        ('admin-probe-app-institution', 'Probe University', '{}', 'United Kingdom', 'GB', 'published');
      INSERT INTO courses (slug, "institutionId", title, level, "durationMonths", overview, status, intakes)
        SELECT 'admin-probe-app-course', id, 'MSc Probing', 'postgraduate', 12, 'x', 'published', '[]'
        FROM institutions WHERE slug = 'admin-probe-app-institution';
    `);
    const courseId = (
      await dataSource.query(`SELECT id FROM courses WHERE slug = 'admin-probe-app-course'`)
    )[0].id;

    const created = await request(app.getHttpServer())
      .post('/v1/applications')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ courseId })
      .expect(201);
    applicationId = created.body.id;
  });

  afterAll(async () => {
    await dataSource.query('TRUNCATE TABLE "courses", "institutions" CASCADE');
    await truncateIdentity(app);
    await app?.close();
  });

  it('lists the application across tenants, something the student-scoped endpoint cannot do', async () => {
    const { token } = await seedAdminSession(app, ['applications.view']);

    const response = await request(app.getHttpServer())
      .get('/v1/admin/applications')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const found = response.body.items.find((item: { id: string }) => item.id === applicationId);
    expect(found).toMatchObject({
      tenantId,
      status: 'draft',
      studentName: 'Grace Hopper',
      courseTitle: 'MSc Probing',
      institutionName: 'Probe University',
    });
    // The list row is deliberately slim — no document gates, to avoid an
    // N+1 gate computation across a page.
    expect(found.attachedDocumentIds).toBeUndefined();
  });

  it('filters by status and by tenantId', async () => {
    const { token } = await seedAdminSession(app, ['applications.view']);

    const byStatus = await request(app.getHttpServer())
      .get('/v1/admin/applications?status=submitted')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(byStatus.body.items.some((item: { id: string }) => item.id === applicationId)).toBe(false);

    const byTenant = await request(app.getHttpServer())
      .get(`/v1/admin/applications?tenantId=${tenantId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(byTenant.body.items.some((item: { id: string }) => item.id === applicationId)).toBe(true);
  });

  it('returns the full document gates on the single-item route', async () => {
    const { token } = await seedAdminSession(app, ['applications.view']);

    const response = await request(app.getHttpServer())
      .get(`/v1/admin/applications/${applicationId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: applicationId,
      readyToSubmit: false,
      missingDocumentTypes: expect.arrayContaining(['identity']),
    });
  });

  it('has no mutating routes — refuses a POST on the collection', async () => {
    const { token } = await seedAdminSession(app, ['applications.view']);

    await request(app.getHttpServer())
      .post('/v1/admin/applications')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(404);
  });

  it('refuses a token without applications.view', async () => {
    const { token } = await seedAdminSession(app, []);

    await request(app.getHttpServer())
      .get('/v1/admin/applications')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});
