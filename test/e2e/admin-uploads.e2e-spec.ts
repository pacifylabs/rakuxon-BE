import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createTestApp, truncateIdentity } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';

/** No Cloudinary credentials are configured in the test environment. */
describe('admin: uploads', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await truncateIdentity(app);
    await app?.close();
  });

  describe('POST /v1/admin/uploads/signature', () => {
    it('refuses an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/v1/admin/uploads/signature')
        .send({ folder: 'testimonials' })
        .expect(401);
    });

    it('answers 400 rather than crashing when Cloudinary is not configured, for any signed-in admin', async () => {
      const { token } = await seedAdminSession(app, []);

      await request(app.getHttpServer())
        .post('/v1/admin/uploads/signature')
        .set('Authorization', `Bearer ${token}`)
        .send({ folder: 'testimonials' })
        .expect(400);
    });

    it('rejects an unknown folder', async () => {
      const { token } = await seedAdminSession(app, []);

      await request(app.getHttpServer())
        .post('/v1/admin/uploads/signature')
        .set('Authorization', `Bearer ${token}`)
        .send({ folder: 'not-a-real-folder' })
        .expect(400);
    });
  });
});
