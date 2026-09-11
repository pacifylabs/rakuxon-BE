import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import speakeasy from 'speakeasy';

import { createTestApp, truncateIdentity } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';

describe('admin: account', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await truncateIdentity(app);
    await app?.close();
  });

  describe('GET /v1/admin/account/me', () => {
    it("returns the caller's own account, with 2FA off by default", async () => {
      const { token, email } = await seedAdminSession(app, []);

      const response = await request(app.getHttpServer())
        .get('/v1/admin/account/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toMatchObject({ email, firstName: 'Test', lastName: 'Admin', totpEnabled: false });
    });

    it('refuses an unauthenticated caller', async () => {
      await request(app.getHttpServer()).get('/v1/admin/account/me').expect(401);
    });
  });

  describe('PATCH /v1/admin/account/me', () => {
    it('updates the name without touching anything else', async () => {
      const { token, email } = await seedAdminSession(app, []);

      const response = await request(app.getHttpServer())
        .patch('/v1/admin/account/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Ada' })
        .expect(200);

      expect(response.body).toMatchObject({ email, firstName: 'Ada', lastName: 'Admin' });
    });
  });

  describe('POST /v1/admin/account/me/password', () => {
    it('changes the password, which then works for a fresh login', async () => {
      const { token, email } = await seedAdminSession(app, []);

      await request(app.getHttpServer())
        .post('/v1/admin/account/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'correct-horse-battery', newPassword: 'a-brand-new-passphrase' })
        .expect(204);

      await request(app.getHttpServer())
        .post('/v1/admin-auth/login')
        .send({ email, password: 'correct-horse-battery' })
        .expect(401);

      await request(app.getHttpServer())
        .post('/v1/admin-auth/login')
        .send({ email, password: 'a-brand-new-passphrase' })
        .expect(200);
    });

    it('refuses a wrong current password', async () => {
      const { token } = await seedAdminSession(app, []);

      await request(app.getHttpServer())
        .post('/v1/admin/account/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'not-the-real-password', newPassword: 'a-brand-new-passphrase' })
        .expect(401);
    });
  });

  describe('two-factor authentication', () => {
    it('walks the full lifecycle: setup, enable, login challenge, backup code, disable', async () => {
      const { token, email } = await seedAdminSession(app, []);

      const setup = await request(app.getHttpServer())
        .post('/v1/admin/account/me/2fa/setup')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(setup.body.secret).toEqual(expect.any(String));
      expect(setup.body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

      const validCode = speakeasy.totp({ secret: setup.body.secret, encoding: 'base32' });

      // A wrong code does not turn 2FA on.
      await request(app.getHttpServer())
        .post('/v1/admin/account/me/2fa/enable')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'not-a-valid-code' })
        .expect(401);

      const enabled = await request(app.getHttpServer())
        .post('/v1/admin/account/me/2fa/enable')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: validCode })
        .expect(200);
      const backupCodes: string[] = enabled.body.backupCodes;
      expect(backupCodes.length).toBeGreaterThanOrEqual(8);

      // Setup must not replace an enabled authenticator.
      await request(app.getHttpServer())
        .post('/v1/admin/account/me/2fa/setup')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      const me = await request(app.getHttpServer())
        .get('/v1/admin/account/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(me.body.totpEnabled).toBe(true);

      // Login now hands back a challenge instead of tokens.
      const login = await request(app.getHttpServer())
        .post('/v1/admin-auth/login')
        .send({ email, password: 'correct-horse-battery' })
        .expect(200);
      expect(login.body).toMatchObject({ requiresTotp: true });
      expect(login.body.accessToken).toBeUndefined();

      // A backup code completes the login exactly once.
      const firstUse = await request(app.getHttpServer())
        .post('/v1/admin-auth/login/verify-totp')
        .send({ challengeToken: login.body.challengeToken, code: backupCodes[0] })
        .expect(200);
      expect(typeof firstUse.body.accessToken).toBe('string');

      const secondLogin = await request(app.getHttpServer())
        .post('/v1/admin-auth/login')
        .send({ email, password: 'correct-horse-battery' })
        .expect(200);
      await request(app.getHttpServer())
        .post('/v1/admin-auth/login/verify-totp')
        .send({ challengeToken: secondLogin.body.challengeToken, code: backupCodes[0] })
        .expect(401);

      const concurrent = await Promise.all([0, 1].map(() =>
        request(app.getHttpServer())
          .post('/v1/admin-auth/login/verify-totp')
          .send({ challengeToken: secondLogin.body.challengeToken, code: backupCodes[1] }),
      ));
      expect(concurrent.map((response) => response.status).sort()).toEqual([200, 401]);

      // Disabling requires the password, and turns login back to normal.
      await request(app.getHttpServer())
        .post('/v1/admin/account/me/2fa/disable')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'not-the-real-password' })
        .expect(401);

      await request(app.getHttpServer())
        .post('/v1/admin/account/me/2fa/disable')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'correct-horse-battery' })
        .expect(204);

      const afterDisable = await request(app.getHttpServer())
        .post('/v1/admin-auth/login')
        .send({ email, password: 'correct-horse-battery' })
        .expect(200);
      expect(typeof afterDisable.body.accessToken).toBe('string');
    });

    it('a real TOTP code completes the login challenge', async () => {
      const { token, email } = await seedAdminSession(app, []);

      const setup = await request(app.getHttpServer())
        .post('/v1/admin/account/me/2fa/setup')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const validCode = speakeasy.totp({ secret: setup.body.secret, encoding: 'base32' });
      await request(app.getHttpServer())
        .post('/v1/admin/account/me/2fa/enable')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: validCode })
        .expect(200);

      const login = await request(app.getHttpServer())
        .post('/v1/admin-auth/login')
        .send({ email, password: 'correct-horse-battery' })
        .expect(200);

      const loginCode = speakeasy.totp({ secret: setup.body.secret, encoding: 'base32' });
      const verified = await request(app.getHttpServer())
        .post('/v1/admin-auth/login/verify-totp')
        .send({ challengeToken: login.body.challengeToken, code: loginCode })
        .expect(200);
      expect(verified.body.admin).toMatchObject({ email });
    });

    it('refuses an expired or forged challenge token', async () => {
      await request(app.getHttpServer())
        .post('/v1/admin-auth/login/verify-totp')
        .send({ challengeToken: 'not-a-real-token', code: '123456' })
        .expect(401);
    });
  });
});
