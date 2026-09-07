import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createTestApp, truncateIdentity, uniqueSlug } from '../helpers/create-test-app';

describe('auth', () => {
  let app: INestApplication;

  const register = (overrides: Record<string, unknown> = {}) => {
    const slug = uniqueSlug();
    return request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        agencyName: 'Northwind Education',
        slug,
        email: `admin@${slug}.example`,
        fullName: 'Ada Lovelace',
        password: 'correct-horse-battery',
        ...overrides,
      });
  };

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await truncateIdentity(app);
    await app?.close();
  });

  describe('POST /v1/auth/register', () => {
    it('creates the agency and returns a session', async () => {
      const response = await register().expect(201);

      expect(response.body).toMatchObject({
        expiresIn: 900,
        user: { role: 'agency_admin', fullName: 'Ada Lovelace' },
      });
      expect(typeof response.body.accessToken).toBe('string');
      expect(typeof response.body.refreshToken).toBe('string');
      expect(response.body.user.tenantId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('never returns the password or its hash', async () => {
      const response = await register().expect(201);
      const body = JSON.stringify(response.body);
      expect(body).not.toContain('correct-horse-battery');
      expect(body).not.toContain('argon2');
      expect(body).not.toContain('passwordHash');
    });

    it('refuses a subdomain that is already taken', async () => {
      const slug = uniqueSlug();
      await register({ slug }).expect(201);
      await register({ slug, email: 'other@example.com' }).expect(409);
    });

    it('refuses a password shorter than the policy', async () => {
      await register({ password: 'short' }).expect(400);
    });

    it.each(['Not Lowercase', 'has space', '-leading', 'trailing-', 'ab'])(
      'refuses the invalid subdomain %s',
      async (slug) => {
        await register({ slug }).expect(400);
      },
    );

    it('rejects a body trying to set its own tenant', async () => {
      // docs/07-api-contract.md: tenancy is derived server-side, never sent.
      await register({ tenantId: '00000000-0000-0000-0000-000000000000' }).expect(400);
    });
  });

  describe('POST /v1/auth/login', () => {
    it('returns a session for correct credentials', async () => {
      const created = await register().expect(201);

      const response = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: created.body.user.email, password: 'correct-horse-battery' })
        .expect(200);

      expect(response.body.user.id).toBe(created.body.user.id);
    });

    it('gives the same answer for a wrong password and an unknown address', async () => {
      const created = await register().expect(201);

      const wrongPassword = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: created.body.user.email, password: 'not-the-password' })
        .expect(401);

      const unknownAddress = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'nobody@nowhere.example', password: 'not-the-password' })
        .expect(401);

      // Identical, so the response cannot enumerate registered addresses.
      expect(wrongPassword.body.message).toBe(unknownAddress.body.message);
    });
  });

  describe('POST /v1/auth/refresh', () => {
    it('rotates: the new token differs from the old one', async () => {
      const created = await register().expect(201);

      const rotated = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: created.body.refreshToken })
        .expect(200);

      expect(rotated.body.refreshToken).not.toBe(created.body.refreshToken);
      expect(typeof rotated.body.accessToken).toBe('string');
    });

    it('refuses to reuse a spent token', async () => {
      const created = await register().expect(201);
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: created.body.refreshToken })
        .expect(200);

      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: created.body.refreshToken })
        .expect(401);
    });

    it('revokes the whole family when a spent token is replayed', async () => {
      const created = await register().expect(201);

      const rotated = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: created.body.refreshToken })
        .expect(200);

      // Replaying the original is indistinguishable from a theft, so the
      // live descendant must die with it.
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: created.body.refreshToken })
        .expect(401);

      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: rotated.body.refreshToken })
        .expect(401);
    });

    it('refuses an unknown token', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: 'not-a-real-token' })
        .expect(401);
    });
  });

  describe('POST /v1/auth/logout', () => {
    it('ends the session', async () => {
      const created = await register().expect(201);

      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .send({ refreshToken: created.body.refreshToken })
        .expect(204);

      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: created.body.refreshToken })
        .expect(401);
    });

    it('is idempotent for an unknown token', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .send({ refreshToken: 'never-existed' })
        .expect(204);
    });
  });

  describe('POST /v1/auth/me', () => {
    it('returns the identity behind the token', async () => {
      const created = await register().expect(201);

      const response = await request(app.getHttpServer())
        .post('/v1/auth/me')
        .set('Authorization', `Bearer ${created.body.accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({ role: 'agency_admin', id: created.body.user.id });
    });

    it('refuses a request with no token, because routes are closed by default', async () => {
      await request(app.getHttpServer()).post('/v1/auth/me').expect(401);
    });

    it('refuses a garbage token', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/me')
        .set('Authorization', 'Bearer nonsense')
        .expect(401);
    });
  });
});
