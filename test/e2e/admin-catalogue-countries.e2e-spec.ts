import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createTestApp, truncateIdentity } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';

/**
 * `countries` is static reference data — the suite's TRUNCATE list
 * deliberately leaves it alone (see admin-data-source.ts) — so every test
 * here restores the row it touches rather than relying on truncation between
 * files.
 */
describe('admin: catalogue countries', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await truncateIdentity(app);
    await app?.close();
  });

  it('lists every reference country, including non-destinations', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.view']);

    const response = await request(app.getHttpServer())
      .get('/v1/admin/catalogue/countries')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const nigeria = response.body.find((row: { code: string }) => row.code === 'NG');
    expect(nigeria).toMatchObject({ name: 'Nigeria', isDestination: false });
  });

  it('activates a country and reflects that on the public reference list', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.publish']);

    try {
      const response = await request(app.getHttpServer())
        .post('/v1/admin/catalogue/countries/NG/activate')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body.isDestination).toBe(true);

      const publicList = await request(app.getHttpServer())
        .get('/v1/catalogue/countries/reference')
        .expect(200);
      const nigeria = publicList.body.find((row: { code: string }) => row.code === 'NG');
      expect(nigeria.isDestination).toBe(true);
    } finally {
      await request(app.getHttpServer())
        .post('/v1/admin/catalogue/countries/NG/deactivate')
        .set('Authorization', `Bearer ${token}`);
    }
  });

  it('deactivates a country currently serving', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.publish']);

    try {
      const response = await request(app.getHttpServer())
        .post('/v1/admin/catalogue/countries/GB/deactivate')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body.isDestination).toBe(false);
    } finally {
      await request(app.getHttpServer())
        .post('/v1/admin/catalogue/countries/GB/activate')
        .set('Authorization', `Bearer ${token}`);
    }
  });

  it('404s for an unknown country code', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.publish']);

    await request(app.getHttpServer())
      .post('/v1/admin/catalogue/countries/ZZ/activate')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('refuses a token without catalogue.publish', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.view']);

    await request(app.getHttpServer())
      .post('/v1/admin/catalogue/countries/NG/activate')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('refuses a token without catalogue.view', async () => {
    const { token } = await seedAdminSession(app, []);

    await request(app.getHttpServer())
      .get('/v1/admin/catalogue/countries')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});
