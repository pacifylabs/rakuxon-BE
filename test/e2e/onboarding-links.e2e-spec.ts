import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { Role, TenantStatus, UserStatus } from '../../src/contract/enums';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
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
        firstName: 'Ada',
        lastName: 'Lovelace',
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
        firstName: 'Temp',
        lastName: 'Counselor',
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

    /* A fresh agency starts pending, and issuing a link is gated on being
       active (see the "vetting gate" tests below) — activate directly here
       so every other describe block in this file, which predates the gate,
       keeps testing issuing/consuming/peeking/registering rather than the
       gate itself. */
    await app.get(DataSource).getRepository(Tenant).update(tenantId, { status: TenantStatus.Active });
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

      // id travels with it now, for the account this link later creates to
      // record its `sourceOnboardingLinkId` provenance.
      expect(response.body).toEqual({
        id: expect.any(String),
        tenantId,
        inviteeEmail: 'student@example.com',
      });
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

  describe('peeking', () => {
    it('shows who the invitation is from without spending it', async () => {
      const issued = await issue(adminToken).expect(201);
      const token = issued.body.url.split('/invite/')[1];

      const response = await request(app.getHttpServer())
        .post('/v1/onboarding-links/peek')
        .send({ token })
        .expect(200);

      expect(response.body).toEqual({
        tenantName: 'Northwind Education',
        inviteeEmail: 'student@example.com',
      });

      // Still redeemable afterwards — peeking must not have consumed it.
      await request(app.getHttpServer())
        .post('/v1/onboarding-links/consume')
        .send({ token })
        .expect(200);
    });

    it('refuses an unknown token, the same way consume does', async () => {
      await request(app.getHttpServer())
        .post('/v1/onboarding-links/peek')
        .send({ token: 'never-existed' })
        .expect(401);
    });
  });

  describe('registering via a link', () => {
    /** Each case issues its own link: registering spends both the token and the email. */
    const uniqueEmail = () => `student-${Math.random().toString(36).slice(2, 8)}@example.com`;

    it('creates a student account in the issuing tenant and returns a session', async () => {
      const email = uniqueEmail();
      const issued = await issue(adminToken, { inviteeEmail: email }).expect(201);
      const token = issued.body.url.split('/invite/')[1];

      const response = await request(app.getHttpServer())
        .post('/v1/onboarding-links/register')
        .send({ token, firstName: 'New', lastName: 'Student', password: 'correct-horse-battery' })
        .expect(201);

      expect(response.body).toMatchObject({
        expiresIn: 900,
        user: { role: 'student', firstName: 'New', lastName: 'Student', tenantId, email },
      });
      expect(typeof response.body.accessToken).toBe('string');
    });

    it('rejects a body that tries to set its own tenant or email', async () => {
      const email = uniqueEmail();
      const issued = await issue(adminToken, { inviteeEmail: email }).expect(201);
      const token = issued.body.url.split('/invite/')[1];

      // ValidationPipe is forbidNonWhitelisted: true — DTO fields the DTO
      // does not declare 400 the whole request rather than being dropped, so
      // there is no way to pass tenantId/email at all. The tenant and invitee
      // email can only come from the token itself.
      await request(app.getHttpServer())
        .post('/v1/onboarding-links/register')
        .send({
          token,
          firstName: 'New',
          lastName: 'Student',
          password: 'correct-horse-battery',
          email: 'someone-else@example.com',
          tenantId: '00000000-0000-0000-0000-000000000000',
        })
        .expect(400);

      // The link is still valid — the bad request never reached consume().
      const response = await request(app.getHttpServer())
        .post('/v1/onboarding-links/register')
        .send({ token, firstName: 'New', lastName: 'Student', password: 'correct-horse-battery' })
        .expect(201);

      expect(response.body.user.tenantId).toBe(tenantId);
      expect(response.body.user.email).toBe(email);
    });

    it('spends the token, so it cannot be redeemed twice', async () => {
      const issued = await issue(adminToken, { inviteeEmail: uniqueEmail() }).expect(201);
      const token = issued.body.url.split('/invite/')[1];

      await request(app.getHttpServer())
        .post('/v1/onboarding-links/register')
        .send({ token, firstName: 'New', lastName: 'Student', password: 'correct-horse-battery' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/v1/onboarding-links/register')
        .send({ token, firstName: 'Someone', lastName: 'Else', password: 'correct-horse-battery' })
        .expect(401);
    });

    it('refuses an invalid token', async () => {
      await request(app.getHttpServer())
        .post('/v1/onboarding-links/register')
        .send({ token: 'never-existed', firstName: 'New', lastName: 'Student', password: 'correct-horse-battery' })
        .expect(401);
    });
  });

  describe('tenant vetting gate', () => {
    it('refuses to issue a link from a pending tenant', async () => {
      const pending = await registerAgency();

      const response = await request(app.getHttpServer())
        .post('/v1/onboarding-links')
        .set('Authorization', `Bearer ${pending.accessToken}`)
        .send({ inviteeEmail: 'student@example.com' })
        .expect(403);

      expect(response.body.message).toBe('Your agency is pending approval before you can invite students.');
    });

    it('allows issuing once the tenant is approved', async () => {
      const fresh = await registerAgency();

      await request(app.getHttpServer())
        .post('/v1/onboarding-links')
        .set('Authorization', `Bearer ${fresh.accessToken}`)
        .send({ inviteeEmail: 'student@example.com' })
        .expect(403);

      await app
        .get(DataSource)
        .getRepository(Tenant)
        .update(fresh.user.tenantId, { status: TenantStatus.Active });

      await request(app.getHttpServer())
        .post('/v1/onboarding-links')
        .set('Authorization', `Bearer ${fresh.accessToken}`)
        .send({ inviteeEmail: 'student2@example.com' })
        .expect(201);
    });
  });
});
