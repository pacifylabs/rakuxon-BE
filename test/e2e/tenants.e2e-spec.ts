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

  async function registerAgency(): Promise<{ tenantId: string; slug: string }> {
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
    return { tenantId: body.user.tenantId, slug };
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

  describe('POST /v1/admin/tenants', () => {
    it('creates a partner directly, active immediately, with a first staff user who can sign in', async () => {
      const slug = uniqueSlug();
      const { token } = await seedAdminSession(app, ['tenants.approve']);
      const email = `staff@${slug}.example`;

      const response = await request(app.getHttpServer())
        .post('/v1/admin/tenants')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Direct Partner',
          slug,
          email,
          firstName: 'Ada',
          lastName: 'Lovelace',
          password: 'correct-horse-battery',
        })
        .expect(201);

      expect(response.body).toMatchObject({ name: 'Direct Partner', slug, status: 'active' });

      const login = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password: 'correct-horse-battery' })
        .expect(200);
      expect(login.body.user.email).toBe(email);
    });

    it('refuses a slug already taken', async () => {
      const slug = uniqueSlug();
      const { token } = await seedAdminSession(app, ['tenants.approve']);
      const create = () =>
        request(app.getHttpServer())
          .post('/v1/admin/tenants')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: 'Direct Partner',
            slug,
            email: `staff-${Math.random().toString(36).slice(2, 8)}@${slug}.example`,
            firstName: 'Ada',
            lastName: 'Lovelace',
            password: 'correct-horse-battery',
          });

      await create().expect(201);
      await create().expect(409);
    });

    it('refuses a token without tenants.approve', async () => {
      const { token } = await seedAdminSession(app, ['tenants.view']);

      await request(app.getHttpServer())
        .post('/v1/admin/tenants')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Direct Partner',
          slug: uniqueSlug(),
          email: 'blocked@example.com',
          firstName: 'Ada',
          lastName: 'Lovelace',
          password: 'correct-horse-battery',
        })
        .expect(403);
    });
  });

  describe('PATCH /v1/admin/tenants/:id', () => {
    it("edits the partner's name", async () => {
      const { tenantId } = await registerAgency();
      const { token } = await seedAdminSession(app, ['tenants.approve']);

      const response = await request(app.getHttpServer())
        .patch(`/v1/admin/tenants/${tenantId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Renamed Partner' })
        .expect(200);

      expect(response.body.name).toBe('Renamed Partner');
    });

    it('refuses a slug already taken by another partner', async () => {
      const { tenantId } = await registerAgency();
      const other = await registerAgency();
      const { token } = await seedAdminSession(app, ['tenants.approve']);

      await request(app.getHttpServer())
        .patch(`/v1/admin/tenants/${tenantId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ slug: other.slug })
        .expect(409);
    });
  });

  describe('partner staff', () => {
    it('adds a staff user, lists them, and lets the admin set their password directly', async () => {
      const { tenantId } = await registerAgency();
      const { token } = await seedAdminSession(app, ['tenants.approve', 'tenants.view']);
      const email = `counselor-${Math.random().toString(36).slice(2, 8)}@example.com`;

      const added = await request(app.getHttpServer())
        .post(`/v1/admin/tenants/${tenantId}/staff`)
        .set('Authorization', `Bearer ${token}`)
        .send({ email, firstName: 'Grace', lastName: 'Hopper', password: 'correct-horse-battery', role: 'counselor' })
        .expect(201);

      expect(added.body).toMatchObject({ email, firstName: 'Grace', lastName: 'Hopper', role: 'counselor' });

      const listed = await request(app.getHttpServer())
        .get(`/v1/admin/tenants/${tenantId}/staff`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(listed.body.items.some((item: { id: string }) => item.id === added.body.id)).toBe(true);

      await request(app.getHttpServer())
        .post(`/v1/admin/tenants/${tenantId}/staff/${added.body.id}/set-password`)
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'a-brand-new-passphrase' })
        .expect(204);

      const login = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password: 'a-brand-new-passphrase' })
        .expect(200);
      expect(login.body.user.email).toBe(email);
    });

    it('refuses a duplicate email within the same partner', async () => {
      const { tenantId } = await registerAgency();
      const { token } = await seedAdminSession(app, ['tenants.approve']);
      const email = `dup-${Math.random().toString(36).slice(2, 8)}@example.com`;

      const add = () =>
        request(app.getHttpServer())
          .post(`/v1/admin/tenants/${tenantId}/staff`)
          .set('Authorization', `Bearer ${token}`)
          .send({ email, firstName: 'Grace', lastName: 'Hopper', password: 'correct-horse-battery' });

      await add().expect(201);
      await add().expect(409);
    });

    it('404s adding staff to an unknown partner', async () => {
      const { token } = await seedAdminSession(app, ['tenants.approve']);

      await request(app.getHttpServer())
        .post('/v1/admin/tenants/00000000-0000-0000-0000-000000000000/staff')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'nobody@example.com',
          firstName: 'Grace',
          lastName: 'Hopper',
          password: 'correct-horse-battery',
        })
        .expect(404);
    });

    it('refuses a token without tenants.approve when adding staff', async () => {
      const { tenantId } = await registerAgency();
      const { token } = await seedAdminSession(app, ['tenants.view']);

      await request(app.getHttpServer())
        .post(`/v1/admin/tenants/${tenantId}/staff`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'blocked@example.com',
          firstName: 'Grace',
          lastName: 'Hopper',
          password: 'correct-horse-battery',
        })
        .expect(403);
    });
  });
});
