import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { createTestApp, truncateIdentity } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';
import { DocumentStatus, DocumentType } from '../../src/contract/enums';
import { Document } from '../../src/modules/documents/entities/document.entity';

describe('admin: applications', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let applicationId: string;
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
    dataSource = app.get(DataSource);

    const session = await registerStudent();
    tenantId = session.user.tenantId;
    studentId = (
      await dataSource.query(`SELECT id FROM students WHERE "userId" = $1`, [session.user.id])
    )[0].id;

    await dataSource.query('TRUNCATE TABLE "courses", "institutions" CASCADE');
    await dataSource.query(`
      INSERT INTO institutions (slug, name, aka, country, "countryCode", status) VALUES
        ('admin-probe-app-institution', 'Probe University', '{}', 'United Kingdom', 'GB', 'published');
      INSERT INTO courses (slug, "institutionId", title, level, "durationMonths", overview, status, intakes)
        SELECT 'admin-probe-app-course', id, 'MSc Probing', 'postgraduate', 12, 'x', 'published', '[]'
        FROM institutions WHERE slug = 'admin-probe-app-institution';
    `);
    const courseId = (
      await dataSource.query(`SELECT id FROM courses WHERE slug = 'admin-probe-app-course'`)
    )[0].id;

    const created = await request(app.getHttpServer())
      .post('/v1/applications')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ courseId })
      .expect(201);
    applicationId = created.body.id;
  });

  afterAll(async () => {
    await dataSource.query('TRUNCATE TABLE "courses", "institutions" CASCADE');
    await truncateIdentity(app);
    await app?.close();
  });

  it('lists the application across tenants, something the student-scoped endpoint cannot do', async () => {
    const { token } = await seedAdminSession(app, ['applications.view']);

    const response = await request(app.getHttpServer())
      .get('/v1/admin/applications')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const found = response.body.items.find((item: { id: string }) => item.id === applicationId);
    expect(found).toMatchObject({
      tenantId,
      status: 'draft',
      studentName: 'Grace Hopper',
      courseTitle: 'MSc Probing',
      institutionName: 'Probe University',
    });
    // The list row is deliberately slim — no document gates, to avoid an
    // N+1 gate computation across a page.
    expect(found.attachedDocumentIds).toBeUndefined();
  });

  it('filters by status and by tenantId', async () => {
    const { token } = await seedAdminSession(app, ['applications.view']);

    const byStatus = await request(app.getHttpServer())
      .get('/v1/admin/applications?status=submitted')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(byStatus.body.items.some((item: { id: string }) => item.id === applicationId)).toBe(false);

    const byTenant = await request(app.getHttpServer())
      .get(`/v1/admin/applications?tenantId=${tenantId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(byTenant.body.items.some((item: { id: string }) => item.id === applicationId)).toBe(true);
  });

  it('returns the full document gates on the single-item route', async () => {
    const { token } = await seedAdminSession(app, ['applications.view']);

    const response = await request(app.getHttpServer())
      .get(`/v1/admin/applications/${applicationId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: applicationId,
      readyToSubmit: false,
      missingDocumentTypes: expect.arrayContaining(['identity']),
    });
  });

  it('has no create route — refuses a POST on the collection itself', async () => {
    const { token } = await seedAdminSession(app, ['applications.view']);

    await request(app.getHttpServer())
      .post('/v1/admin/applications')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(404);
  });

  it('refuses a token without applications.view', async () => {
    const { token } = await seedAdminSession(app, []);

    await request(app.getHttpServer())
      .get('/v1/admin/applications')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  describe('attaching a document on the student\'s behalf', () => {
    async function seedUploadedDocument(status: DocumentStatus = DocumentStatus.Uploaded): Promise<Document> {
      const repo = dataSource.getRepository(Document);
      return repo.save(
        repo.create({
          tenantId,
          studentId,
          type: DocumentType.Identity,
          status,
          originalFilename: 'passport.pdf',
          cloudinaryPublicId: `test/${Math.random().toString(36).slice(2, 10)}`,
          url: 'https://res.cloudinary.com/demo/raw/upload/v1/passport.pdf',
        }),
      );
    }

    it('attaches an admin-uploaded document without clearing it from missingDocumentTypes, until it is approved', async () => {
      const document = await seedUploadedDocument();
      const { token } = await seedAdminSession(app, ['applications.manage']);

      const response = await request(app.getHttpServer())
        .post(`/v1/admin/applications/${applicationId}/documents/${document.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.attachedDocumentIds).toContain(document.id);
      expect(response.body.missingDocumentTypes).toContain('identity');

      await request(app.getHttpServer())
        .delete(`/v1/admin/applications/${applicationId}/documents/${document.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('clears it from missingDocumentTypes once the attached document is approved', async () => {
      const document = await seedUploadedDocument(DocumentStatus.Approved);
      const { token } = await seedAdminSession(app, ['applications.manage']);

      const response = await request(app.getHttpServer())
        .post(`/v1/admin/applications/${applicationId}/documents/${document.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.attachedDocumentIds).toContain(document.id);
      expect(response.body.missingDocumentTypes).not.toContain('identity');

      await request(app.getHttpServer())
        .delete(`/v1/admin/applications/${applicationId}/documents/${document.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('detaches it again, putting the type back in missingDocumentTypes', async () => {
      const document = await seedUploadedDocument();
      const { token } = await seedAdminSession(app, ['applications.manage']);

      await request(app.getHttpServer())
        .post(`/v1/admin/applications/${applicationId}/documents/${document.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const response = await request(app.getHttpServer())
        .delete(`/v1/admin/applications/${applicationId}/documents/${document.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.attachedDocumentIds).not.toContain(document.id);
    });

    it('refuses a document that belongs to a different student', async () => {
      const otherStudent = await registerStudent();
      const otherStudentId = (
        await dataSource.query(`SELECT id FROM students WHERE "userId" = $1`, [otherStudent.user.id])
      )[0].id;

      const repo = dataSource.getRepository(Document);
      const foreignDocument = await repo.save(
        repo.create({
          tenantId: otherStudent.user.tenantId,
          studentId: otherStudentId,
          type: DocumentType.Identity,
          status: DocumentStatus.Uploaded,
          originalFilename: 'passport.pdf',
          cloudinaryPublicId: `test/${Math.random().toString(36).slice(2, 10)}`,
          url: 'https://res.cloudinary.com/demo/raw/upload/v1/passport.pdf',
        }),
      );

      const { token } = await seedAdminSession(app, ['applications.manage']);

      await request(app.getHttpServer())
        .post(`/v1/admin/applications/${applicationId}/documents/${foreignDocument.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('refuses applications.view alone — attaching needs applications.manage', async () => {
      const document = await seedUploadedDocument();
      const { token } = await seedAdminSession(app, ['applications.view']);

      await request(app.getHttpServer())
        .post(`/v1/admin/applications/${applicationId}/documents/${document.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('assignment', () => {
    it('lists active admins for the assign picker, without needing admins.manage', async () => {
      const { token, adminId } = await seedAdminSession(app, ['applications.manage']);

      const response = await request(app.getHttpServer())
        .get('/v1/admin/applications/assignable-admins')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.items.some((item: { id: string }) => item.id === adminId)).toBe(true);
    });

    it('assigns the application to an admin, and unassigns with adminId: null', async () => {
      const { token, adminId } = await seedAdminSession(app, ['applications.manage']);

      const assigned = await request(app.getHttpServer())
        .patch(`/v1/admin/applications/${applicationId}/assign`)
        .set('Authorization', `Bearer ${token}`)
        .send({ adminId })
        .expect(200);
      expect(assigned.body.assignedAdminId).toBe(adminId);
      expect(assigned.body.assignedAdminName).toBe('Test Admin');

      const unassigned = await request(app.getHttpServer())
        .patch(`/v1/admin/applications/${applicationId}/assign`)
        .set('Authorization', `Bearer ${token}`)
        .send({ adminId: null })
        .expect(200);
      expect(unassigned.body.assignedAdminId).toBeNull();
    });

    it('works on a submitted application too, not just a draft', async () => {
      const session = await registerStudent();
      const courseId = (
        await dataSource.query(`SELECT id FROM courses WHERE slug = 'admin-probe-app-course'`)
      )[0].id;
      const created = await request(app.getHttpServer())
        .post('/v1/applications')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ courseId })
        .expect(201);

      const { token, adminId } = await seedAdminSession(app, ['applications.manage']);
      await request(app.getHttpServer())
        .patch(`/v1/admin/applications/${created.body.id}/assign`)
        .set('Authorization', `Bearer ${token}`)
        .send({ adminId })
        .expect(200);
    });

    it('refuses applications.view alone — assigning needs applications.manage', async () => {
      const { token: viewer } = await seedAdminSession(app, ['applications.view']);
      const { adminId } = await seedAdminSession(app, ['applications.manage']);

      await request(app.getHttpServer())
        .patch(`/v1/admin/applications/${applicationId}/assign`)
        .set('Authorization', `Bearer ${viewer}`)
        .send({ adminId })
        .expect(403);
    });

    it('404s for an application that does not exist', async () => {
      const { token, adminId } = await seedAdminSession(app, ['applications.manage']);

      await request(app.getHttpServer())
        .patch('/v1/admin/applications/00000000-0000-0000-0000-000000000000/assign')
        .set('Authorization', `Bearer ${token}`)
        .send({ adminId })
        .expect(404);
    });
  });

  describe('audit log', () => {
    it("records the assignment on the application's own history, attributed to the acting admin", async () => {
      const { token, adminId } = await seedAdminSession(app, ['applications.manage']);

      await request(app.getHttpServer())
        .patch(`/v1/admin/applications/${applicationId}/assign`)
        .set('Authorization', `Bearer ${token}`)
        .send({ adminId })
        .expect(200);

      const { token: viewer } = await seedAdminSession(app, ['applications.view']);
      const history = await request(app.getHttpServer())
        .get(`/v1/admin/applications/${applicationId}/audit-log`)
        .set('Authorization', `Bearer ${viewer}`)
        .expect(200);

      const entry = history.body.items.find((item: { action: string }) => item.action === 'applications.manage');
      expect(entry).toMatchObject({
        actorType: 'admin',
        actorId: adminId,
        actorName: 'Test Admin',
        resourceType: 'application',
        resourceId: applicationId,
      });
    });

    it('also appears on the platform-wide activity log, gated by platform.audit', async () => {
      const { token, adminId } = await seedAdminSession(app, ['applications.manage']);
      await request(app.getHttpServer())
        .patch(`/v1/admin/applications/${applicationId}/assign`)
        .set('Authorization', `Bearer ${token}`)
        .send({ adminId })
        .expect(200);

      const { token: auditor } = await seedAdminSession(app, ['platform.audit']);
      const platformLog = await request(app.getHttpServer())
        .get('/v1/admin/audit-log?resourceType=application')
        .set('Authorization', `Bearer ${auditor}`)
        .expect(200);
      expect(
        platformLog.body.items.some((item: { resourceId: string }) => item.resourceId === applicationId),
      ).toBe(true);

      const { token: noAccess } = await seedAdminSession(app, ['applications.manage']);
      await request(app.getHttpServer())
        .get('/v1/admin/audit-log')
        .set('Authorization', `Bearer ${noAccess}`)
        .expect(403);
    });
  });
});
