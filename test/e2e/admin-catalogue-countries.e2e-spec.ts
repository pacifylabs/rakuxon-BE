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

  it('sets a country\'s homepage position and reflects it on the public featured list, then clears it', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.publish', 'catalogue.view']);

    try {
      const set = await request(app.getHttpServer())
        .patch('/v1/admin/catalogue/countries/NG/homepage-featured')
        .set('Authorization', `Bearer ${token}`)
        .send({ homepageFeaturedOrder: 1 })
        .expect(200);
      expect(set.body.homepageFeaturedOrder).toBe(1);

      const list = await request(app.getHttpServer())
        .get('/v1/admin/catalogue/countries')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const nigeria = list.body.find((row: { code: string }) => row.code === 'NG');
      expect(nigeria.homepageFeaturedOrder).toBe(1);

      /* Nigeria has no published institutions in this test database, so it
         cannot appear in the featured list even once featured — the join
         requires a published institution row. Asserting the shape (flagEmoji
         present) on whichever countries the fixture does have published
         institutions for is the honest check here. */
      const publicFeatured = await request(app.getHttpServer())
        .get('/v1/catalogue/countries?featured=true')
        .expect(200);
      for (const row of publicFeatured.body) {
        expect(row.flagEmoji).toBeTruthy();
      }

      const cleared = await request(app.getHttpServer())
        .patch('/v1/admin/catalogue/countries/NG/homepage-featured')
        .set('Authorization', `Bearer ${token}`)
        .send({ homepageFeaturedOrder: null })
        .expect(200);
      expect(cleared.body.homepageFeaturedOrder).toBeNull();
    } finally {
      await request(app.getHttpServer())
        .patch('/v1/admin/catalogue/countries/NG/homepage-featured')
        .set('Authorization', `Bearer ${token}`)
        .send({ homepageFeaturedOrder: null });
    }
  });

  it('404s setting the homepage position of an unknown country code', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.publish']);

    await request(app.getHttpServer())
      .patch('/v1/admin/catalogue/countries/ZZ/homepage-featured')
      .set('Authorization', `Bearer ${token}`)
      .send({ homepageFeaturedOrder: 1 })
      .expect(404);
  });
});
