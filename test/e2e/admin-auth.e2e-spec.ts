import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createTestApp, truncateIdentity } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';

describe('admin auth', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await truncateIdentity(app);
    await app?.close();
  });

  describe('login', () => {
    it('logs in and carries the granted permissions on the token', async () => {
      const { email } = await seedAdminSession(app, ['tenants.view']);

      const response = await request(app.getHttpServer())
        .post('/v1/admin-auth/login')
        .send({ email, password: 'correct-horse-battery' })
        .expect(200);

      expect(response.body.admin).toMatchObject({ email, permissions: ['tenants.view'] });
      expect(typeof response.body.accessToken).toBe('string');
      expect(typeof response.body.refreshToken).toBe('string');
    });

    it('logs in fine with no permissions at all — permissions gate routes, not login', async () => {
      const { email } = await seedAdminSession(app, []);

      const response = await request(app.getHttpServer())
        .post('/v1/admin-auth/login')
        .send({ email, password: 'correct-horse-battery' })
        .expect(200);

      expect(response.body.admin.permissions).toEqual([]);
    });

    it('gives the same message for an unknown address and a wrong password', async () => {
      const { email } = await seedAdminSession(app);

      const wrongPassword = await request(app.getHttpServer())
        .post('/v1/admin-auth/login')
        .send({ email, password: 'not-the-password' })
        .expect(401);

      const unknownEmail = await request(app.getHttpServer())
        .post('/v1/admin-auth/login')
        .send({ email: 'never-existed@example.com', password: 'not-the-password' })
        .expect(401);

      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });

    it('refuses a users-table token on an admin route — the two systems do not cross-verify', async () => {
      const student = await request(app.getHttpServer())
        .post('/v1/auth/register/student')
        .send({
          email: `student-${Math.random().toString(36).slice(2, 8)}@example.com`,
          firstName: 'A',
          lastName: 'B',
          password: 'correct-horse-battery',
        })
        .expect(201);

      await request(app.getHttpServer())
        .get('/v1/admin/tenants')
        .set('Authorization', `Bearer ${student.body.accessToken}`)
        .expect(401);
    });
  });

  describe('refresh', () => {
    it('rotates the token and keeps the same permissions', async () => {
      const { email } = await seedAdminSession(app, ['tenants.view']);
      const login = await request(app.getHttpServer())
        .post('/v1/admin-auth/login')
        .send({ email, password: 'correct-horse-battery' })
        .expect(200);

      const refreshed = await request(app.getHttpServer())
        .post('/v1/admin-auth/refresh')
        .send({ refreshToken: login.body.refreshToken })
        .expect(200);

      expect(refreshed.body.admin.permissions).toEqual(['tenants.view']);
      expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);
    });

    it('revokes the whole family on a replayed refresh token', async () => {
      const { email } = await seedAdminSession(app);
      const login = await request(app.getHttpServer())
        .post('/v1/admin-auth/login')
        .send({ email, password: 'correct-horse-battery' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/v1/admin-auth/refresh')
        .send({ refreshToken: login.body.refreshToken })
        .expect(200);

      await request(app.getHttpServer())
        .post('/v1/admin-auth/refresh')
        .send({ refreshToken: login.body.refreshToken })
        .expect(401);
    });
  });

  describe('logout', () => {
    it('is idempotent — an unknown token still succeeds', async () => {
      await request(app.getHttpServer())
        .post('/v1/admin-auth/logout')
        .send({ refreshToken: 'never-existed' })
        .expect(204);
    });
  });

  describe('password reset', () => {
    it('always answers 204, whether or not the address has an account', async () => {
      const { email } = await seedAdminSession(app);

      await request(app.getHttpServer())
        .post('/v1/admin-auth/password-reset/request')
        .send({ email })
        .expect(204);

      await request(app.getHttpServer())
        .post('/v1/admin-auth/password-reset/request')
        .send({ email: 'never-existed@example.com' })
        .expect(204);
    });
  });
});
