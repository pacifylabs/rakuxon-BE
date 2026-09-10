import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createTestApp, truncateIdentity } from '../helpers/create-test-app';

describe('students', () => {
  let app: INestApplication;
  let accessToken: string;

  async function registerStudent(overrides: Record<string, unknown> = {}) {
    const { body } = await request(app.getHttpServer())
      .post('/v1/auth/register/student')
      .send({
        email: `student-${Math.random().toString(36).slice(2, 8)}@example.com`,
        firstName: 'Grace',
        lastName: 'Hopper',
        password: 'correct-horse-battery',
        ...overrides,
      })
      .expect(201);
    return body;
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    ({ accessToken } = await registerStudent());
  });

  afterAll(async () => {
    await truncateIdentity(app);
    await app?.close();
  });

  describe('GET /v1/students/me', () => {
    it('returns an empty profile right after registration', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/students/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        dateOfBirth: null,
        nationality: null,
        address: {},
        educationHistory: [],
        profileCompletedAt: null,
      });
    });

    it('refuses an unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/v1/students/me').expect(401);
    });

    it('refuses a non-student token', async () => {
      const agency = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          agencyName: 'Temp',
          slug: `temp-${Math.random().toString(36).slice(2, 8)}`,
          email: `admin-${Math.random().toString(36).slice(2, 8)}@example.com`,
          firstName: 'Temp',
          lastName: 'Admin',
          password: 'correct-horse-battery',
        })
        .expect(201);

      await request(app.getHttpServer())
        .get('/v1/students/me')
        .set('Authorization', `Bearer ${agency.body.accessToken}`)
        .expect(403);
    });
  });

  describe('PATCH /v1/students/me', () => {
    it('saves a partial update without requiring every field', async () => {
      const response = await request(app.getHttpServer())
        .patch('/v1/students/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ nationality: 'NG', phone: '+2348012345678' })
        .expect(200);

      expect(response.body).toMatchObject({ nationality: 'NG', phone: '+2348012345678' });
      expect(response.body.profileCompletedAt).toBeNull();
    });

    it('is scoped to the caller — one student cannot see another edit through it', async () => {
      const other = await registerStudent();

      await request(app.getHttpServer())
        .patch('/v1/students/me')
        .set('Authorization', `Bearer ${other.accessToken}`)
        .send({ nationality: 'FR' })
        .expect(200);

      const mine = await request(app.getHttpServer())
        .get('/v1/students/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(mine.body.nationality).not.toBe('FR');
    });

    it('sets profileCompletedAt once every required field is present', async () => {
      const { accessToken: token } = await registerStudent();

      const beforeComplete = await request(app.getHttpServer())
        .patch('/v1/students/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ dateOfBirth: '2001-04-12', nationality: 'NG' })
        .expect(200);
      expect(beforeComplete.body.profileCompletedAt).toBeNull();

      const completed = await request(app.getHttpServer())
        .patch('/v1/students/me')
        .set('Authorization', `Bearer ${token}`)
        .send({
          phone: '+2348012345678',
          intendedStudyLevel: 'undergraduate',
          intendedCountry: 'GB',
          preferredIntake: '2026-09',
          educationHistory: [{ institutionName: 'Lagos High School', qualification: 'WAEC' }],
        })
        .expect(200);

      expect(completed.body.profileCompletedAt).not.toBeNull();
    });

    it('does not re-clear profileCompletedAt once set, even if a field is later blanked', async () => {
      const { accessToken: token } = await registerStudent();

      await request(app.getHttpServer())
        .patch('/v1/students/me')
        .set('Authorization', `Bearer ${token}`)
        .send({
          dateOfBirth: '2001-04-12',
          nationality: 'NG',
          phone: '+2348012345678',
          intendedStudyLevel: 'undergraduate',
          intendedCountry: 'GB',
          preferredIntake: '2026-09',
          educationHistory: [{ institutionName: 'Lagos High School', qualification: 'WAEC' }],
        })
        .expect(200);

      const after = await request(app.getHttpServer())
        .patch('/v1/students/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ nationality: 'FR' })
        .expect(200);

      expect(after.body.profileCompletedAt).not.toBeNull();
    });

    it('rejects a malformed education history entry', async () => {
      await request(app.getHttpServer())
        .patch('/v1/students/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ educationHistory: [{ startYear: 'not-a-year' }] })
        .expect(400);
    });
  });
});
