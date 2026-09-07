import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { Role, UserStatus } from '../../src/contract/enums';
import { User } from '../../src/modules/users/entities/user.entity';
import { createTestApp, truncateIdentity, uniqueSlug } from '../helpers/create-test-app';

describe('onboarding links', () => {
  let app: INestApplication;
  let adminToken: string;
  let tenantId: string;
  let counselorToken: string;

  async function registerAgency() {
    const slug = uniqueSlug();
    const { body } = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        agencyName: 'Northwind Education',
        slug,
        email: `admin@${slug}.example`,
        fullName: 'Ada Lovelace',
        password: 'correct-horse-battery',
      })
      .expect(201);
    return body;
  }

  /** A counselor in the same tenant, to prove role boundaries. */
  async function addCounselor(tenant: string): Promise<string> {
    const dataSource = app.get(DataSource);
    const repo = dataSource.getRepository(User);
    const email = `counselor-${Math.random().toString(36).slice(2, 8)}@example.com`;

    const admin = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        agencyName: 'Temp',
        slug: uniqueSlug('temp'),
        email: `t-${email}`,
        fullName: 'Temp',
        password: 'correct-horse-battery',
      })
      .expect(201);

    await repo.update(
      { id: admin.body.user.id },
      { tenantId: tenant, role: Role.Counselor, status: UserStatus.Active },
    );

    const relogin = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: `t-${email}`, password: 'correct-horse-battery' })
      .expect(200);

    return relogin.body.accessToken;
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    const session = await registerAgency();
    adminToken = session.accessToken;
    tenantId = session.user.tenantId;
    counselorToken = await addCounselor(tenantId);
  });

  afterAll(async () => {
    await truncateIdentity(app);
    await app?.close();
  });

  const issue = (token: string, body: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/v1/onboarding-links')
      .set('Authorization', `Bearer ${token}`)
      .send({ inviteeEmail: 'student@example.com', ...body });

  describe('issuing', () => {
    it('returns a link with an expiry', async () => {
      const response = await issue(adminToken).expect(201);

      expect(response.body.url).toContain('/invite/');
      expect(response.body.inviteeEmail).toBe('student@example.com');
      expect(new Date(response.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('issues a unique token every time', async () => {
      const [a, b] = await Promise.all([issue(adminToken).expect(201), issue(adminToken).expect(201)]);
      expect(a.body.url).not.toBe(b.body.url);
    });

    it('honours a custom expiry', async () => {
      const response = await issue(adminToken, { expiresInDays: 1 }).expect(201);
      const days = (new Date(response.body.expiresAt).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeLessThan(1.1);
    });

    it('rejects an expiry outside the allowed window', async () => {
      await issue(adminToken, { expiresInDays: 999 }).expect(400);
    });

    it('allows a counselor', async () => {
      await issue(counselorToken).expect(201);
    });

    it('refuses an unauthenticated caller', async () => {
      await request(app.getHttpServer())
        .post('/v1/onboarding-links')
        .send({ inviteeEmail: 'student@example.com' })
        .expect(401);
    });

    it('rejects a body trying to choose its own tenant', async () => {
      await issue(adminToken, { tenantId: '00000000-0000-0000-0000-000000000000' }).expect(400);
    });
  });

  describe('consuming', () => {
    it('redeems a valid link without authentication', async () => {
      const issued = await issue(adminToken).expect(201);
      const token = issued.body.url.split('/invite/')[1];

      const response = await request(app.getHttpServer())
        .post('/v1/onboarding-links/consume')
        .send({ token })
        .expect(200);

      expect(response.body).toEqual({ tenantId, inviteeEmail: 'student@example.com' });
    });

    it('refuses a second use of the same link', async () => {
      const issued = await issue(adminToken).expect(201);
      const token = issued.body.url.split('/invite/')[1];

      await request(app.getHttpServer())
        .post('/v1/onboarding-links/consume')
        .send({ token })
        .expect(200);

      await request(app.getHttpServer())
        .post('/v1/onboarding-links/consume')
        .send({ token })
        .expect(401);
    });

    it('refuses a revoked link', async () => {
      const issued = await issue(adminToken).expect(201);
      const token = issued.body.url.split('/invite/')[1];

      await request(app.getHttpServer())
        .delete(`/v1/onboarding-links/${issued.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .post('/v1/onboarding-links/consume')
        .send({ token })
        .expect(401);
    });

    it('gives one answer for unknown, used and revoked links', async () => {
      const issued = await issue(adminToken).expect(201);
      const token = issued.body.url.split('/invite/')[1];
      await request(app.getHttpServer()).post('/v1/onboarding-links/consume').send({ token });

      const used = await request(app.getHttpServer())
        .post('/v1/onboarding-links/consume')
        .send({ token })
        .expect(401);

      const unknown = await request(app.getHttpServer())
        .post('/v1/onboarding-links/consume')
        .send({ token: 'never-existed' })
        .expect(401);

      // Otherwise a near-miss guess tells the holder they were close.
      expect(used.body.message).toBe(unknown.body.message);
    });
  });
});
