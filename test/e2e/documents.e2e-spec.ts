import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { createTestApp, truncateIdentity } from '../helpers/create-test-app';
import { DocumentType } from '../../src/contract/enums';
import { Document } from '../../src/modules/documents/entities/document.entity';
import { Student } from '../../src/modules/students/entities/student.entity';

describe('documents', () => {
  let app: INestApplication;
  let accessToken: string;
  let tenantId: string;
  let studentId: string;

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

  beforeAll(async () => {
    ({ app } = await createTestApp());
    const session = await registerStudent();
    accessToken = session.accessToken;
    tenantId = session.user.tenantId;

    const dataSource = app.get(DataSource);
    const student = await dataSource.getRepository(Student).findOneOrFail({
      where: { userId: session.user.id },
    });
    studentId = student.id;
  });

  afterAll(async () => {
    await truncateIdentity(app);
    await app?.close();
  });

  /** No Cloudinary credentials are configured in the test environment. */
  describe('POST /v1/documents/upload-signature', () => {
    it('refuses an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/v1/documents/upload-signature')
        .send({ type: 'identity', filename: 'passport.pdf' })
        .expect(401);
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
        .post('/v1/documents/upload-signature')
        .set('Authorization', `Bearer ${agency.body.accessToken}`)
        .send({ type: 'identity', filename: 'passport.pdf' })
        .expect(403);
    });

    it('answers 400 rather than crashing when Cloudinary is not configured', async () => {
      await request(app.getHttpServer())
        .post('/v1/documents/upload-signature')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'identity', filename: 'passport.pdf' })
        .expect(400);
    });

    it('rejects an unknown document type', async () => {
      await request(app.getHttpServer())
        .post('/v1/documents/upload-signature')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'not-a-real-type', filename: 'passport.pdf' })
        .expect(400);
    });
  });

  /*
   * confirm/list/remove do not depend on Cloudinary being configured — they
   * act on a row that already exists. Since the signature endpoint is what's
   * unavailable in this environment, these seed the row directly, the same
   * way onboarding-links.e2e-spec reaches into the DataSource to set up a
   * counselor the public API has no path to create.
   */
  async function seedDocument(overrides: Partial<Document> = {}): Promise<Document> {
    const dataSource = app.get(DataSource);
    const repo = dataSource.getRepository(Document);
    return repo.save(
      repo.create({
        tenantId,
        studentId,
        type: DocumentType.Identity,
        originalFilename: 'passport.pdf',
        cloudinaryPublicId: `test/${Math.random().toString(36).slice(2, 10)}`,
        ...overrides,
      }),
    );
  }

  describe('POST /v1/documents/:id/confirm', () => {
    it('records the confirmed upload', async () => {
      const document = await seedDocument();

      const response = await request(app.getHttpServer())
        .post(`/v1/documents/${document.id}/confirm`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          secureUrl: 'https://res.cloudinary.com/demo/raw/upload/v1/passport.pdf',
          bytes: 12_345,
          mimeType: 'application/pdf',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'uploaded',
        url: 'https://res.cloudinary.com/demo/raw/upload/v1/passport.pdf',
        bytes: 12_345,
        mimeType: 'application/pdf',
      });
    });

    it("refuses to confirm another student's document", async () => {
      const document = await seedDocument();
      const other = await registerStudent();

      await request(app.getHttpServer())
        .post(`/v1/documents/${document.id}/confirm`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .send({
          secureUrl: 'https://res.cloudinary.com/demo/raw/upload/v1/passport.pdf',
          bytes: 1,
          mimeType: 'application/pdf',
        })
        .expect(403);
    });

    it('refuses an unknown document id', async () => {
      await request(app.getHttpServer())
        .post('/v1/documents/00000000-0000-0000-0000-000000000000/confirm')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          secureUrl: 'https://res.cloudinary.com/demo/raw/upload/v1/passport.pdf',
          bytes: 1,
          mimeType: 'application/pdf',
        })
        .expect(404);
    });
  });

  describe('GET /v1/documents', () => {
    it('lists only the caller\'s own documents, newest first', async () => {
      const other = await registerStudent();
      await seedDocument();
      const mine = await seedDocument();

      const response = await request(app.getHttpServer())
        .get('/v1/documents')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const ids: string[] = response.body.map((d: { id: string }) => d.id);
      expect(ids).toContain(mine.id);
      expect(response.body[0].id).toBe(mine.id);

      const othersList = await request(app.getHttpServer())
        .get('/v1/documents')
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(200);
      expect(othersList.body).toEqual([]);
    });
  });

  describe('DELETE /v1/documents/:id', () => {
    it('marks the document deleted rather than removing the row', async () => {
      const document = await seedDocument();

      await request(app.getHttpServer())
        .delete(`/v1/documents/${document.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      const dataSource = app.get(DataSource);
      const stored = await dataSource
        .getRepository(Document)
        .findOneOrFail({ where: { id: document.id } });
      expect(stored.status).toBe('deleted');
    });

    it("refuses to delete another student's document", async () => {
      const document = await seedDocument();
      const other = await registerStudent();

      await request(app.getHttpServer())
        .delete(`/v1/documents/${document.id}`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(403);
    });
  });
});
