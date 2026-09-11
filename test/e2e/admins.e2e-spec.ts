import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createTestApp, truncateIdentity } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';

describe('admin: admins', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await truncateIdentity(app);
    await app?.close();
  });

  describe('permission catalogue', () => {
    it('lists the seeded permission catalogue', async () => {
      const { token } = await seedAdminSession(app, ['admins.manage']);

      const response = await request(app.getHttpServer())
        .get('/v1/admin/admins/permissions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const keys = response.body.map((row: { key: string }) => row.key);
      expect(keys).toEqual(expect.arrayContaining(['tenants.view', 'tenants.approve', 'admins.manage']));
    });
  });

  describe('creating', () => {
    it('creates an admin with the given permission set', async () => {
      const { token } = await seedAdminSession(app, ['admins.manage']);
      const email = `new-admin-${Math.random().toString(36).slice(2, 8)}@example.com`;

      const response = await request(app.getHttpServer())
        .post('/v1/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email,
          firstName: 'New',
          lastName: 'Admin',
          password: 'correct-horse-battery',
          permissionKeys: ['tenants.view'],
        })
        .expect(201);

      expect(response.body).toMatchObject({ email, permissions: ['tenants.view'], status: 'active' });

      // The new admin can actually sign in and use the granted permission.
      const login = await request(app.getHttpServer())
        .post('/v1/admin-auth/login')
        .send({ email, password: 'correct-horse-battery' })
        .expect(200);

      await request(app.getHttpServer())
        .get('/v1/admin/tenants')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200);
    });

    it('rejects an unknown permission key', async () => {
      const { token } = await seedAdminSession(app, ['admins.manage']);

      await request(app.getHttpServer())
        .post('/v1/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: `bad-${Math.random().toString(36).slice(2, 8)}@example.com`,
          firstName: 'New',
          lastName: 'Admin',
          password: 'correct-horse-battery',
          permissionKeys: ['not-a-real-permission'],
        })
        .expect(400);
    });

    it('rejects a duplicate email', async () => {
      const { token, email } = await seedAdminSession(app, ['admins.manage']);

      await request(app.getHttpServer())
        .post('/v1/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .send({ email, firstName: 'Dup', lastName: 'Licate', password: 'correct-horse-battery', permissionKeys: [] })
        .expect(409);
    });

    it('refuses a token without admins.manage — an admin cannot grant itself more access', async () => {
      const { token } = await seedAdminSession(app, ['tenants.view']);

      await request(app.getHttpServer())
        .post('/v1/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: `nope-${Math.random().toString(36).slice(2, 8)}@example.com`,
          firstName: 'No',
          lastName: 'Access',
          password: 'correct-horse-battery',
          permissionKeys: [],
        })
        .expect(403);
    });
  });

  describe('listing', () => {
    it('lists every admin with their current permissions', async () => {
      const { token } = await seedAdminSession(app, ['admins.manage']);
      const other = await seedAdminSession(app, ['tenants.view']);

      const response = await request(app.getHttpServer())
        .get('/v1/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const found = response.body.items.find((item: { id: string }) => item.id === other.adminId);
      expect(found).toMatchObject({ email: other.email, permissions: ['tenants.view'] });
    });
  });

  describe('updating permissions', () => {
    it('replaces the permission set exactly, not additively', async () => {
      const { token } = await seedAdminSession(app, ['admins.manage']);
      const target = await seedAdminSession(app, ['tenants.view', 'tenants.approve']);

      const response = await request(app.getHttpServer())
        .patch(`/v1/admin/admins/${target.adminId}/permissions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ permissionKeys: ['catalogue.view'] })
        .expect(200);

      expect(response.body.permissions).toEqual(['catalogue.view']);
    });
  });

  describe('suspending and reactivating', () => {
    it('suspends an admin, who can no longer log in, then reactivates them', async () => {
      const { token } = await seedAdminSession(app, ['admins.manage']);
      const target = await seedAdminSession(app, []);

      await request(app.getHttpServer())
        .post(`/v1/admin/admins/${target.adminId}/suspend`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/v1/admin-auth/login')
        .send({ email: target.email, password: 'correct-horse-battery' })
        .expect(401);

      await request(app.getHttpServer())
        .post(`/v1/admin/admins/${target.adminId}/reactivate`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/v1/admin-auth/login')
        .send({ email: target.email, password: 'correct-horse-battery' })
        .expect(200);
    });
  });
});
