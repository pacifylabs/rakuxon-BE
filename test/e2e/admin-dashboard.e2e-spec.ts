import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createTestApp, truncateIdentity } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';

describe('admin: dashboard', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await truncateIdentity(app);
    await app?.close();
  });

  it('returns platform totals to any signed-in admin, no specific permission required', async () => {
    const { token } = await seedAdminSession(app, []);

    const response = await request(app.getHttpServer())
      .get('/v1/admin/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      totalTenants: expect.any(Number),
      totalInstitutions: expect.any(Number),
      totalCourses: expect.any(Number),
      totalArticles: expect.any(Number),
      totalStudents: expect.any(Number),
      totalApplications: expect.any(Number),
      tenantsByStatus: expect.any(Array),
      institutionsByStatus: expect.any(Array),
      applicationsByStatus: expect.any(Array),
      studentsWithCompleteProfile: expect.any(Number),
      studentsWithIncompleteProfile: expect.any(Number),
    });
  });

  it('refuses an unauthenticated caller', async () => {
    await request(app.getHttpServer()).get('/v1/admin/dashboard/summary').expect(401);
  });
});
