import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createTestApp, truncateIdentity } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';

describe('admin: students', () => {
  let app: INestApplication;
  let studentId: string;

  async function registerStudent(overrides: Record<string, unknown> = {}) {
    const { body } = await request(app.getHttpServer())
      .post('/v1/auth/register/student')
      .send({
        email: `student-${Math.random().toString(36).slice(2, 8)}@example.com`,
        firstName: 'Ada',
        lastName: 'Lovelace',
        password: 'correct-horse-battery',
        ...overrides,
      })
      .expect(201);
    return body;
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());

    const { accessToken } = await registerStudent();
    const me = await request(app.getHttpServer())
      .get('/v1/students/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    studentId = me.body.id;
  });

  afterAll(async () => {
    await truncateIdentity(app);
    await app?.close();
  });

  describe('GET /v1/admin/students', () => {
    it('lists the registered student, with identity joined in', async () => {
      const { token } = await seedAdminSession(app, ['students.view']);

      const response = await request(app.getHttpServer())
        .get('/v1/admin/students')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const row = response.body.items.find((item: { id: string }) => item.id === studentId);
      expect(row).toMatchObject({ email: expect.stringContaining('@example.com'), fullName: 'Ada Lovelace' });
      expect(row).toHaveProperty('createdAt');
      expect(row.applicationsCount).toBe(0);
    });

    it('searches by name', async () => {
      const { token } = await seedAdminSession(app, ['students.view']);

      const response = await request(app.getHttpServer())
        .get('/v1/admin/students')
        .query({ q: 'Lovelace' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.items.some((item: { id: string }) => item.id === studentId)).toBe(true);
    });

    it('refuses a token without students.view', async () => {
      const { token } = await seedAdminSession(app, []);

      await request(app.getHttpServer())
        .get('/v1/admin/students')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('refuses an unauthenticated caller', async () => {
      await request(app.getHttpServer()).get('/v1/admin/students').expect(401);
    });
  });

  describe('GET /v1/admin/students/:id', () => {
    it('returns the full applicant profile', async () => {
      const { token } = await seedAdminSession(app, ['students.view']);

      const response = await request(app.getHttpServer())
        .get(`/v1/admin/students/${studentId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: studentId,
        fullName: 'Ada Lovelace',
        address: {},
        educationHistory: [],
      });
    });

    it('404s for an id that does not exist', async () => {
      const { token } = await seedAdminSession(app, ['students.view']);

      await request(app.getHttpServer())
        .get('/v1/admin/students/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('PATCH /v1/admin/students/:id', () => {
    it('edits the applicant profile on the student’s behalf', async () => {
      const { token } = await seedAdminSession(app, ['students.manage', 'students.view']);

      const response = await request(app.getHttpServer())
        .patch(`/v1/admin/students/${studentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          nationality: 'NG',
          phone: '+2348012345678',
          intendedStudyLevel: 'undergraduate',
          intendedCountry: 'GB',
          preferredIntake: '2026-09',
          educationHistory: [{ institutionName: 'Lagos High School', qualification: 'WAEC' }],
        })
        .expect(200);

      expect(response.body).toMatchObject({
        id: studentId,
        nationality: 'NG',
        phone: '+2348012345678',
        intendedStudyLevel: 'undergraduate',
        intendedCountry: 'GB',
        preferredIntake: '2026-09',
        educationHistory: [{ institutionName: 'Lagos High School', qualification: 'WAEC' }],
      });

      const persisted = await request(app.getHttpServer())
        .get(`/v1/admin/students/${studentId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(persisted.body.nationality).toBe('NG');
    });

    it('refuses a token with only students.view', async () => {
      const { token } = await seedAdminSession(app, ['students.view']);

      await request(app.getHttpServer())
        .patch(`/v1/admin/students/${studentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ nationality: 'GH' })
        .expect(403);
    });

    it("edits the account's email and name alongside the profile", async () => {
      const { token } = await seedAdminSession(app, ['students.manage', 'students.view']);
      const newEmail = `renamed-${Math.random().toString(36).slice(2, 8)}@example.com`;

      const response = await request(app.getHttpServer())
        .patch(`/v1/admin/students/${studentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ email: newEmail, firstName: 'Grace', lastName: 'Hopper' })
        .expect(200);

      expect(response.body).toMatchObject({ email: newEmail, fullName: 'Grace Hopper' });
    });

    it('refuses to change the email to one already registered in the same partner', async () => {
      const other = await registerStudent();
      const { token } = await seedAdminSession(app, ['students.manage']);

      await request(app.getHttpServer())
        .patch(`/v1/admin/students/${studentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ email: other.user.email })
        .expect(409);
    });
  });

  describe('POST /v1/admin/students', () => {
    it("creates a student on the partner's behalf, with a password set directly", async () => {
      const { token } = await seedAdminSession(app, ['students.manage']);
      const email = `created-${Math.random().toString(36).slice(2, 8)}@example.com`;

      const response = await request(app.getHttpServer())
        .post('/v1/admin/students')
        .set('Authorization', `Bearer ${token}`)
        .send({ email, firstName: 'Marie', lastName: 'Curie', password: 'correct-horse-battery' })
        .expect(201);

      expect(response.body).toMatchObject({ email, fullName: 'Marie Curie' });

      const login = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password: 'correct-horse-battery' })
        .expect(200);
      expect(login.body.user.email).toBe(email);
    });

    it('refuses a duplicate email in the same partner', async () => {
      const existing = await registerStudent();
      const { token } = await seedAdminSession(app, ['students.manage']);

      await request(app.getHttpServer())
        .post('/v1/admin/students')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: existing.user.email,
          firstName: 'Ada',
          lastName: 'Lovelace',
          password: 'correct-horse-battery',
        })
        .expect(409);
    });

    it('refuses a token without students.manage', async () => {
      const { token } = await seedAdminSession(app, ['students.view']);

      await request(app.getHttpServer())
        .post('/v1/admin/students')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: `blocked-${Math.random().toString(36).slice(2, 8)}@example.com`,
          firstName: 'Ada',
          lastName: 'Lovelace',
          password: 'correct-horse-battery',
        })
        .expect(403);
    });
  });

  describe('POST /v1/admin/students/:id/set-password', () => {
    it("sets a student's password directly, and the new password signs them in", async () => {
      const created = await registerStudent();
      const me = await request(app.getHttpServer())
        .get('/v1/students/me')
        .set('Authorization', `Bearer ${created.accessToken}`)
        .expect(200);

      const { token } = await seedAdminSession(app, ['students.manage']);
      await request(app.getHttpServer())
        .post(`/v1/admin/students/${me.body.id}/set-password`)
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'a-brand-new-passphrase' })
        .expect(204);

      const login = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: created.user.email, password: 'a-brand-new-passphrase' })
        .expect(200);
      expect(login.body.user.email).toBe(created.user.email);
      await request(app.getHttpServer()).post('/v1/auth/refresh')
        .send({ refreshToken: created.refreshToken }).expect(401);

    });

    it('404s for an id that does not exist', async () => {
      const { token } = await seedAdminSession(app, ['students.manage']);

      await request(app.getHttpServer())
        .post('/v1/admin/students/00000000-0000-0000-0000-000000000000/set-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'a-brand-new-passphrase' })
        .expect(404);
    });
  });
});
