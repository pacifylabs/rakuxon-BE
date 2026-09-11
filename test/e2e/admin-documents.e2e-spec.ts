import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { CapturingNotifications, createTestApp, truncateIdentity } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';
import { DocumentStatus, DocumentType } from '../../src/contract/enums';
import { Document } from '../../src/modules/documents/entities/document.entity';
import { Notification } from '../../src/modules/notifications-inbox/entities/notification.entity';
import { Student } from '../../src/modules/students/entities/student.entity';

describe('admin: documents', () => {
  let app: INestApplication;
  let notifications: CapturingNotifications;
  let studentId: string;
  let studentUserId: string;

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

  async function seedDocument(overrides: Partial<Document> = {}): Promise<Document> {
    const dataSource = app.get(DataSource);
    const student = await dataSource.getRepository(Student).findOneOrFail({ where: { id: studentId } });
    const repo = dataSource.getRepository(Document);
    return repo.save(
      repo.create({
        tenantId: student.tenantId,
        studentId,
        type: DocumentType.Identity,
        status: DocumentStatus.Uploaded,
        originalFilename: 'passport.pdf',
        cloudinaryPublicId: `test/${Math.random().toString(36).slice(2, 10)}`,
        url: 'https://res.cloudinary.com/demo/raw/upload/v1/passport.pdf',
        ...overrides,
      }),
    );
  }

  beforeAll(async () => {
    ({ app, notifications } = await createTestApp());

    const session = await registerStudent();
    studentUserId = session.user.id;

    const dataSource = app.get(DataSource);
    const student = await dataSource.getRepository(Student).findOneOrFail({ where: { userId: session.user.id } });
    studentId = student.id;
  });

  afterAll(async () => {
    await truncateIdentity(app);
    await app?.close();
  });

  describe('GET /v1/admin/students/:studentId/documents', () => {
    it("lists the student's documents", async () => {
      const document = await seedDocument();
      const { token } = await seedAdminSession(app, ['documents.review']);

      const response = await request(app.getHttpServer())
        .get(`/v1/admin/students/${studentId}/documents`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.some((row: { id: string }) => row.id === document.id)).toBe(true);
    });

    it('refuses a token without documents.review', async () => {
      const { token } = await seedAdminSession(app, []);

      await request(app.getHttpServer())
        .get(`/v1/admin/students/${studentId}/documents`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('POST /v1/admin/students/:studentId/documents/upload-signature', () => {
    it('answers 400 rather than crashing when Cloudinary is not configured', async () => {
      const { token } = await seedAdminSession(app, ['documents.review']);

      await request(app.getHttpServer())
        .post(`/v1/admin/students/${studentId}/documents/upload-signature`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'identity', filename: 'passport.pdf' })
        .expect(400);
    });
  });

  describe('POST /v1/admin/documents/:id/confirm', () => {
    it('records the confirmed upload for a document an admin issued', async () => {
      const document = await seedDocument({ status: DocumentStatus.PendingUpload, url: null });
      const { token } = await seedAdminSession(app, ['documents.review']);

      const response = await request(app.getHttpServer())
        .post(`/v1/admin/documents/${document.id}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          secureUrl: 'https://res.cloudinary.com/demo/raw/upload/v1/passport.pdf',
          bytes: 12_345,
          mimeType: 'application/pdf',
        })
        .expect(200);

      expect(response.body).toMatchObject({ status: 'uploaded', bytes: 12_345 });
    });
  });

  describe('POST /v1/admin/documents/:id/reject', () => {
    it('rejects the document, notifies the student in-app, and emails them', async () => {
      const document = await seedDocument();
      const { token, adminId } = await seedAdminSession(app, ['documents.review']);

      const response = await request(app.getHttpServer())
        .post(`/v1/admin/documents/${document.id}/reject`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'The scan is illegible — please re-upload a clearer copy.' })
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'rejected',
        rejectionReason: 'The scan is illegible — please re-upload a clearer copy.',
      });

      const dataSource = app.get(DataSource);
      const saved = await dataSource.getRepository(Document).findOneOrFail({ where: { id: document.id } });
      expect(saved.reviewedByAdminId).toBe(adminId);
      expect(saved.reviewedAt).not.toBeNull();

      const inboxRows = await dataSource.getRepository(Notification).find({ where: { userId: studentUserId } });
      expect(inboxRows).toHaveLength(1);
      expect(inboxRows[0]).toMatchObject({ type: 'document_rejected', link: '/dashboard/documents' });

      expect(notifications.documentRejections).toHaveLength(1);
      expect(notifications.documentRejections[0]).toMatchObject({
        documentType: 'identity',
        reason: 'The scan is illegible — please re-upload a clearer copy.',
      });
    });

    it('refuses a token without documents.review', async () => {
      const document = await seedDocument();
      const { token } = await seedAdminSession(app, []);

      await request(app.getHttpServer())
        .post(`/v1/admin/documents/${document.id}/reject`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'x' })
        .expect(403);
    });
  });
});
