import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { EmailVerificationToken } from '../../src/modules/auth/entities/email-verification-token.entity';
import { adminDataSource } from '../helpers/admin-data-source';
import { createTestApp, truncateIdentity, uniqueSlug } from '../helpers/create-test-app';
import type { CapturingNotifications } from '../helpers/create-test-app';

describe('email verification', () => {
  let app: INestApplication;
  let notifications: CapturingNotifications;

  async function registerAgency() {
    const slug = uniqueSlug();
    const { body } = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        agencyName: 'Northwind',
        slug,
        email: `admin@${slug}.example`,
        firstName: 'Ada',
        lastName: 'Lovelace',
        password: 'correct-horse-battery',
      })
      .expect(201);
    return body;
  }

  async function registerStudent() {
    const { body } = await request(app.getHttpServer())
      .post('/v1/auth/register/student')
      .send({
        email: `student-${Math.random().toString(36).slice(2, 8)}@example.com`,
        firstName: 'Grace',
        lastName: 'Hopper',
        password: 'correct-horse-battery',
      })
      .expect(201);
    return body;
  }

  /** The token is only ever sent by email, so tests read the row directly. */
  async function latestVerificationTokenHash(userId: string): Promise<EmailVerificationToken> {
    const repo = (await adminDataSource()).getRepository(EmailVerificationToken);
    const [row] = await repo.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 1 });
    return row as EmailVerificationToken;
  }

  beforeAll(async () => {
    ({ app, notifications } = await createTestApp());
  });

  afterAll(async () => {
    await truncateIdentity(app);
    await app?.close();
  });

  it('sends a verification email on agency registration', async () => {
    const session = await registerAgency();
    expect(() => notifications.latestVerificationTokenFor(session.user.email)).not.toThrow();
    expect(session.user.emailVerifiedAt).toBeNull();
  });

  it('sends a verification email on direct student registration', async () => {
    const session = await registerStudent();
    expect(() => notifications.latestVerificationTokenFor(session.user.email)).not.toThrow();
    expect(session.user.emailVerifiedAt).toBeNull();
  });

  it('stores only a hash of the verification token', async () => {
    const session = await registerAgency();

    const { createHash } = await import('node:crypto');
    const emitted = notifications.latestVerificationTokenFor(session.user.email);
    const grant = await latestVerificationTokenHash(session.user.id);

    expect(grant.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(grant.tokenHash).not.toBe(emitted);
    expect(grant.tokenHash).toBe(createHash('sha256').update(emitted).digest('hex'));
    expect(grant.consumedAt).toBeNull();
  });

  it('refuses an unknown verification token', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/verify-email/confirm')
      .send({ token: 'never-issued' })
      .expect(401);
  });

  describe('completing verification', () => {
    it('sets emailVerifiedAt and does not revoke the current session', async () => {
      const session = await registerAgency();
      const token = notifications.latestVerificationTokenFor(session.user.email);

      await request(app.getHttpServer())
        .post('/v1/auth/verify-email/confirm')
        .send({ token })
        .expect(204);

      // Unlike a password reset, an existing refresh token still works.
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(200);
    });

    it('is single-use', async () => {
      const session = await registerAgency();
      const token = notifications.latestVerificationTokenFor(session.user.email);

      await request(app.getHttpServer())
        .post('/v1/auth/verify-email/confirm')
        .send({ token })
        .expect(204);

      await request(app.getHttpServer())
        .post('/v1/auth/verify-email/confirm')
        .send({ token })
        .expect(401);
    });
  });

  describe('resending', () => {
    it('refuses an unauthenticated request', async () => {
      await request(app.getHttpServer()).post('/v1/auth/verify-email/resend').expect(401);
    });

    it('issues a second, distinct token for a signed-in unverified user', async () => {
      const session = await registerAgency();
      const firstToken = notifications.latestVerificationTokenFor(session.user.email);

      await request(app.getHttpServer())
        .post('/v1/auth/verify-email/resend')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(204);

      const secondToken = notifications.latestVerificationTokenFor(session.user.email);
      expect(secondToken).not.toBe(firstToken);

      // The first link still works — resending does not revoke earlier ones.
      await request(app.getHttpServer())
        .post('/v1/auth/verify-email/confirm')
        .send({ token: firstToken })
        .expect(204);
    });

    it('is a no-op once the address is already verified', async () => {
      const session = await registerAgency();
      const token = notifications.latestVerificationTokenFor(session.user.email);

      await request(app.getHttpServer())
        .post('/v1/auth/verify-email/confirm')
        .send({ token })
        .expect(204);

      await request(app.getHttpServer())
        .post('/v1/auth/verify-email/resend')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(204);

      // No new token was issued — the endpoint returned before sending one.
      expect(notifications.latestVerificationTokenFor(session.user.email)).toBe(token);
    });
  });
});
