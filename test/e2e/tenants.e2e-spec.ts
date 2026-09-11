import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createTestApp, truncateIdentity, uniqueSlug } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';

describe('admin: tenants', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await truncateIdentity(app);
    await app?.close();
  });

  async function registerAgency(): Promise<{ tenantId: string }> {
    const slug = uniqueSlug();
    const { body } = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        agencyName: 'Northwind Education',
        slug,
        email: `admin@${slug}.example`,
        firstName: 'Ada',
        lastName: 'Lovelace',
        password: 'correct-horse-battery',
      })
      .expect(201);
    return { tenantId: body.user.tenantId };
  }

  describe('listing', () => {
    it('lists a freshly registered agency as pending', async () => {
      const { tenantId } = await registerAgency();
      const { token } = await seedAdminSession(app, ['tenants.view']);

      const response = await request(app.getHttpServer())
        .get('/v1/admin/tenants?status=pending')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.items.some((item: { id: string }) => item.id === tenantId)).toBe(true);
    });

    it('refuses a token without tenants.view', async () => {
      const { token } = await seedAdminSession(app, []);

      await request(app.getHttpServer())
        .get('/v1/admin/tenants')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('refuses an unauthenticated caller', async () => {
      await request(app.getHttpServer()).get('/v1/admin/tenants').expect(401);
    });
  });

  describe('approving', () => {
    it('moves a pending tenant to active', async () => {
      const { tenantId } = await registerAgency();
      const { token } = await seedAdminSession(app, ['tenants.approve']);

      const response = await request(app.getHttpServer())
        .post(`/v1/admin/tenants/${tenantId}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.status).toBe('active');
    });

    it('refuses to approve a tenant that is not pending', async () => {
      const { tenantId } = await registerAgency();
      const { token } = await seedAdminSession(app, ['tenants.approve']);

      await request(app.getHttpServer())
        .post(`/v1/admin/tenants/${tenantId}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/v1/admin/tenants/${tenantId}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .expect(409);
    });

    it('refuses a token without tenants.approve', async () => {
      const { tenantId } = await registerAgency();
      const { token } = await seedAdminSession(app, ['tenants.view']);

      await request(app.getHttpServer())
        .post(`/v1/admin/tenants/${tenantId}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('suspending and reactivating', () => {
    it('suspends only an active tenant, and reactivates only a suspended one', async () => {
      const { tenantId } = await registerAgency();
      const approver = await seedAdminSession(app, ['tenants.approve', 'tenants.suspend']);

      await request(app.getHttpServer())
        .post(`/v1/admin/tenants/${tenantId}/suspend`)
        .set('Authorization', `Bearer ${approver.token}`)
        .expect(409);

      await request(app.getHttpServer())
        .post(`/v1/admin/tenants/${tenantId}/approve`)
        .set('Authorization', `Bearer ${approver.token}`)
        .expect(200);

      const suspended = await request(app.getHttpServer())
        .post(`/v1/admin/tenants/${tenantId}/suspend`)
        .set('Authorization', `Bearer ${approver.token}`)
        .expect(200);
      expect(suspended.body.status).toBe('suspended');

      await request(app.getHttpServer())
        .post(`/v1/admin/tenants/${tenantId}/suspend`)
        .set('Authorization', `Bearer ${approver.token}`)
        .expect(409);

      const reactivated = await request(app.getHttpServer())
        .post(`/v1/admin/tenants/${tenantId}/reactivate`)
        .set('Authorization', `Bearer ${approver.token}`)
        .expect(200);
      expect(reactivated.body.status).toBe('active');
    });
  });
});
