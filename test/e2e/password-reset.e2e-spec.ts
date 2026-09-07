import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PasswordResetToken } from '../../src/modules/auth/entities/password-reset-token.entity';
import { adminDataSource } from '../helpers/admin-data-source';
import { createTestApp, truncateIdentity, uniqueSlug } from '../helpers/create-test-app';
import type { CapturingNotifications } from '../helpers/create-test-app';

describe('password reset', () => {
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
        fullName: 'Ada Lovelace',
        password: 'correct-horse-battery',
      })
      .expect(201);
    return body;
  }

  /** The token is only ever sent by email, so tests read the row directly. */
  async function latestResetTokenHash(userId: string): Promise<PasswordResetToken> {
    /* Owner connection: the credential tables are readable only on the
       identity path, which is the point of their policy. */
    const repo = (await adminDataSource()).getRepository(PasswordResetToken);
    const [row] = await repo.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 1 });
    return row as PasswordResetToken;
  }

  beforeAll(async () => {
    ({ app, notifications } = await createTestApp());
  });

  afterAll(async () => {
    await truncateIdentity(app);
    await app?.close();
  });

  it('answers 204 for an address that exists', async () => {
    const session = await registerAgency();
    await request(app.getHttpServer())
      .post('/v1/auth/password-reset/request')
      .send({ email: session.user.email })
      .expect(204);
  });

  it('answers 204 for an address that does not, so it cannot enumerate', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/password-reset/request')
      .send({ email: 'nobody@nowhere.example' })
      .expect(204);
  });

  it('stores only a hash of the reset token', async () => {
    const session = await registerAgency();
    await request(app.getHttpServer())
      .post('/v1/auth/password-reset/request')
      .send({ email: session.user.email })
      .expect(204);

    const { createHash } = await import('node:crypto');
    const emitted = notifications.latestTokenFor(session.user.email);
    const grant = await latestResetTokenHash(session.user.id);

    expect(grant.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(grant.tokenHash).not.toBe(emitted);
    expect(grant.tokenHash).toBe(createHash('sha256').update(emitted).digest('hex'));
    expect(grant.consumedAt).toBeNull();
  });

  it('refuses an unknown reset token', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/password-reset/confirm')
      .send({ token: 'never-issued', password: 'a-brand-new-passphrase' })
      .expect(401);
  });

  it('refuses a new password shorter than the policy', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/password-reset/confirm')
      .send({ token: 'anything', password: 'short' })
      .expect(400);
  });

  describe('completing a reset', () => {
    /* Drives the real flow: request, read the token out of what would have
       been emailed, confirm. Nothing is rewritten in the database. */
    async function resetFlow() {
      const session = await registerAgency();

      await request(app.getHttpServer())
        .post('/v1/auth/password-reset/request')
        .send({ email: session.user.email })
        .expect(204);

      return { session, token: notifications.latestTokenFor(session.user.email) };
    }

    it('sets the new password and lets it sign in', async () => {
      const { session, token } = await resetFlow();

      await request(app.getHttpServer())
        .post('/v1/auth/password-reset/confirm')
        .send({ token, password: 'a-brand-new-passphrase' })
        .expect(204);

      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: session.user.email, password: 'a-brand-new-passphrase' })
        .expect(200);
    });

    it('stops the old password working', async () => {
      const { session, token } = await resetFlow();

      await request(app.getHttpServer())
        .post('/v1/auth/password-reset/confirm')
        .send({ token, password: 'a-brand-new-passphrase' })
        .expect(204);

      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: session.user.email, password: 'correct-horse-battery' })
        .expect(401);
    });

    it('revokes every existing session', async () => {
      const { session, token } = await resetFlow();

      await request(app.getHttpServer())
        .post('/v1/auth/password-reset/confirm')
        .send({ token, password: 'a-brand-new-passphrase' })
        .expect(204);

      // If the reset was triggered by a compromise, the attacker's refresh
      // token must not survive it.
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
    });

    it('is single-use', async () => {
      const { token } = await resetFlow();

      await request(app.getHttpServer())
        .post('/v1/auth/password-reset/confirm')
        .send({ token, password: 'a-brand-new-passphrase' })
        .expect(204);

      await request(app.getHttpServer())
        .post('/v1/auth/password-reset/confirm')
        .send({ token, password: 'another-new-passphrase' })
        .expect(401);
    });
  });
});
