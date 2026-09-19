import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { CapturingNotifications, createTestApp, truncateIdentity } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';
import { DocumentStatus, DocumentType, UserStatus } from '../../src/contract/enums';
import { Admin } from '../../src/modules/admins/entities/admin.entity';
import { AdminRole } from '../../src/modules/admins/entities/admin-role.entity';
import { PasswordService } from '../../src/modules/auth/password.service';
import { Document } from '../../src/modules/documents/entities/document.entity';
import { Application } from '../../src/modules/applications/entities/application.entity';
import { Notification } from '../../src/modules/notifications-inbox/entities/notification.entity';
import { Student } from '../../src/modules/students/entities/student.entity';

describe('applications', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let notifications: CapturingNotifications;
  let accessToken: string;
  let publishedCourseId: string;
  let draftCourseId: string;
  let closedIntakeCourseId: string;

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

  /** The required document types, all approved, for the calling student. */
  async function completeProfileAndDocuments(token: string, userId: string): Promise<void> {
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

    const student = await dataSource
      .getRepository(Student)
      .findOneOrFail({ where: { userId } });

    const documentsRepo = dataSource.getRepository(Document);
    for (const type of [DocumentType.Identity, DocumentType.AcademicCertificate, DocumentType.EnglishTest]) {
      await documentsRepo.save(
        documentsRepo.create({
          tenantId: student.tenantId,
          studentId: student.id,
          type,
          status: DocumentStatus.Approved,
          originalFilename: `${type}.pdf`,
          cloudinaryPublicId: `test/${Math.random().toString(36).slice(2, 10)}`,
          url: 'https://res.cloudinary.com/demo/raw/upload/v1/doc.pdf',
        }),
      );
    }
  }

  beforeAll(async () => {
    ({ app, notifications } = await createTestApp());
    dataSource = app.get(DataSource);

    const session = await registerStudent();
    accessToken = session.accessToken;

    await dataSource.query('TRUNCATE TABLE "courses", "institutions" CASCADE');
    await dataSource.query(`
      INSERT INTO institutions (slug, name, aka, country, "countryCode", status) VALUES
        ('probe-app-institution', 'Probe University', '{}', 'United Kingdom', 'GB', 'published');
      INSERT INTO courses (slug, "institutionId", title, level, "durationMonths", overview, status, intakes)
        SELECT 'probe-app-course', id, 'MSc Probing', 'postgraduate', 12, 'x', 'published', '[]'
        FROM institutions WHERE slug = 'probe-app-institution';
      INSERT INTO courses (slug, "institutionId", title, level, "durationMonths", overview, status, intakes)
        SELECT 'probe-app-draft-course', id, 'MSc Draft', 'postgraduate', 12, 'x', 'draft', '[]'
        FROM institutions WHERE slug = 'probe-app-institution';
      INSERT INTO courses (slug, "institutionId", title, level, "durationMonths", overview, status, intakes)
        SELECT 'probe-app-closed-course', id, 'MSc Closed', 'postgraduate', 12, 'x', 'published',
          '[{"month":"Sep","year":2025,"status":"closed"}]'
        FROM institutions WHERE slug = 'probe-app-institution';
    `);

    const rows = await dataSource.query(
      `SELECT slug, id FROM courses WHERE slug IN ($1, $2, $3)`,
      ['probe-app-course', 'probe-app-draft-course', 'probe-app-closed-course'],
    );
    publishedCourseId = rows.find((r: { slug: string }) => r.slug === 'probe-app-course').id;
    draftCourseId = rows.find((r: { slug: string }) => r.slug === 'probe-app-draft-course').id;
    closedIntakeCourseId = rows.find((r: { slug: string }) => r.slug === 'probe-app-closed-course').id;
  });

  afterAll(async () => {
    await dataSource.query('TRUNCATE TABLE "courses", "institutions" CASCADE');
    await truncateIdentity(app);
    await app?.close();
  });

  describe('POST /v1/applications', () => {
    it('creates a draft for a published course', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/applications')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ courseId: publishedCourseId })
        .expect(201);

      expect(response.body).toMatchObject({
        courseId: publishedCourseId,
        status: 'draft',
        submittedAt: null,
        attachedDocumentIds: [],
        readyToSubmit: false,
      });
      expect(response.body.missingDocumentTypes.sort()).toEqual(
        ['academic_certificate', 'english_test', 'identity'].sort(),
      );
    });

    it('refuses an unknown course', async () => {
      await request(app.getHttpServer())
        .post('/v1/applications')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ courseId: '00000000-0000-0000-0000-000000000000' })
        .expect(404);
    });

    it('refuses a draft (unpublished) course', async () => {
      await request(app.getHttpServer())
        .post('/v1/applications')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ courseId: draftCourseId })
        .expect(400);
    });

    it('refuses a course whose only intake is closed', async () => {
      await request(app.getHttpServer())
        .post('/v1/applications')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ courseId: closedIntakeCourseId })
        .expect(409);
    });

    it('refuses an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/v1/applications')
        .send({ courseId: publishedCourseId })
        .expect(401);
    });
  });

  describe('GET /v1/applications and /v1/applications/:id', () => {
    it('lists only the caller\'s own applications', async () => {
      const other = await registerStudent();
      await request(app.getHttpServer())
        .post('/v1/applications')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ courseId: publishedCourseId })
        .expect(201);

      const mine = await request(app.getHttpServer())
        .get('/v1/applications')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(mine.body.length).toBeGreaterThan(0);

      const othersList = await request(app.getHttpServer())
        .get('/v1/applications')
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(200);
      expect(othersList.body).toEqual([]);
    });

    it('refuses to fetch another student\'s application by id', async () => {
      const created = await request(app.getHttpServer())
        .post('/v1/applications')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ courseId: publishedCourseId })
        .expect(201);

      const other = await registerStudent();
      await request(app.getHttpServer())
        .get(`/v1/applications/${created.body.id}`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(403);
    });
  });

  describe('attaching and detaching documents', () => {
    it('attaches an uploaded document without clearing its type from missingDocumentTypes, until it is approved', async () => {
      // Attaching only ever required `uploaded` — the submission gate is
      // stricter, and requires the admin to have approved it. See
      // ApplicationsService.withGates().
      const session = await registerStudent();
      const student = await dataSource
        .getRepository(Student)
        .findOneOrFail({ where: { userId: session.user.id } });

      const document = await dataSource.getRepository(Document).save(
        dataSource.getRepository(Document).create({
          tenantId: student.tenantId,
          studentId: student.id,
          type: DocumentType.Identity,
          status: DocumentStatus.Uploaded,
          originalFilename: 'passport.pdf',
          cloudinaryPublicId: `test/${Math.random().toString(36).slice(2, 10)}`,
        }),
      );

      const created = await request(app.getHttpServer())
        .post('/v1/applications')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ courseId: publishedCourseId })
        .expect(201);

      const attached = await request(app.getHttpServer())
        .post(`/v1/applications/${created.body.id}/documents/${document.id}`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);

      expect(attached.body.attachedDocumentIds).toContain(document.id);
      expect(attached.body.missingDocumentTypes).toContain('identity');
      expect(attached.body.readyToSubmit).toBe(false);

      await dataSource.getRepository(Document).update(document.id, { status: DocumentStatus.Approved });

      const refetched = await request(app.getHttpServer())
        .get(`/v1/applications/${created.body.id}`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);

      expect(refetched.body.missingDocumentTypes).not.toContain('identity');

      const detached = await request(app.getHttpServer())
        .delete(`/v1/applications/${created.body.id}/documents/${document.id}`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);

      expect(detached.body.attachedDocumentIds).not.toContain(document.id);
    });

    it('accepts attaching a document that is already approved', async () => {
      const session = await registerStudent();
      const student = await dataSource
        .getRepository(Student)
        .findOneOrFail({ where: { userId: session.user.id } });

      const document = await dataSource.getRepository(Document).save(
        dataSource.getRepository(Document).create({
          tenantId: student.tenantId,
          studentId: student.id,
          type: DocumentType.Identity,
          status: DocumentStatus.Approved,
          originalFilename: 'passport.pdf',
          cloudinaryPublicId: `test/${Math.random().toString(36).slice(2, 10)}`,
        }),
      );

      const created = await request(app.getHttpServer())
        .post('/v1/applications')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ courseId: publishedCourseId })
        .expect(201);

      const attached = await request(app.getHttpServer())
        .post(`/v1/applications/${created.body.id}/documents/${document.id}`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);

      expect(attached.body.attachedDocumentIds).toContain(document.id);
      expect(attached.body.missingDocumentTypes).not.toContain('identity');
    });

    it('refuses to attach a document that is not fully uploaded', async () => {
      const session = await registerStudent();
      const student = await dataSource
        .getRepository(Student)
        .findOneOrFail({ where: { userId: session.user.id } });

      const pending = await dataSource.getRepository(Document).save(
        dataSource.getRepository(Document).create({
          tenantId: student.tenantId,
          studentId: student.id,
          type: DocumentType.Identity,
          status: DocumentStatus.PendingUpload,
          originalFilename: 'passport.pdf',
          cloudinaryPublicId: `test/${Math.random().toString(36).slice(2, 10)}`,
        }),
      );

      const created = await request(app.getHttpServer())
        .post('/v1/applications')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ courseId: publishedCourseId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v1/applications/${created.body.id}/documents/${pending.id}`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(400);
    });

    it('refuses to attach another student\'s document', async () => {
      const owner = await registerStudent();
      const attacker = await registerStudent();

      const ownerStudent = await dataSource
        .getRepository(Student)
        .findOneOrFail({ where: { userId: owner.user.id } });
      const document = await dataSource.getRepository(Document).save(
        dataSource.getRepository(Document).create({
          tenantId: ownerStudent.tenantId,
          studentId: ownerStudent.id,
          type: DocumentType.Identity,
          status: DocumentStatus.Uploaded,
          originalFilename: 'passport.pdf',
          cloudinaryPublicId: `test/${Math.random().toString(36).slice(2, 10)}`,
        }),
      );

      const created = await request(app.getHttpServer())
        .post('/v1/applications')
        .set('Authorization', `Bearer ${attacker.accessToken}`)
        .send({ courseId: publishedCourseId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v1/applications/${created.body.id}/documents/${document.id}`)
        .set('Authorization', `Bearer ${attacker.accessToken}`)
        .expect(403);
    });
  });

  describe('POST /v1/applications/:id/submit', () => {
    it('refuses submission until the profile is complete', async () => {
      const created = await request(app.getHttpServer())
        .post('/v1/applications')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ courseId: publishedCourseId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v1/applications/${created.body.id}/submit`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('refuses an incomplete profile even when all required documents are attached', async () => {
      const session = await registerStudent();
      await completeProfileAndDocuments(session.accessToken, session.user.id);
      const student = await dataSource.getRepository(Student).findOneOrFail({ where: { userId: session.user.id } });
      await dataSource.getRepository(Student).update(student.id, { profileCompletedAt: null });
      const uploaded = await dataSource.getRepository(Document).find({ where: { studentId: student.id } });
      const created = await request(app.getHttpServer()).post('/v1/applications')
        .set('Authorization', `Bearer ${session.accessToken}`).send({ courseId: publishedCourseId }).expect(201);
      for (const document of uploaded) {
        await request(app.getHttpServer()).post(`/v1/applications/${created.body.id}/documents/${document.id}`)
          .set('Authorization', `Bearer ${session.accessToken}`).expect(200);
      }
      await request(app.getHttpServer()).post(`/v1/applications/${created.body.id}/submit`)
        .set('Authorization', `Bearer ${session.accessToken}`).expect(400);
    });

    it('submits once the profile and required documents are both in place, and refuses a resubmission', async () => {
      const session = await registerStudent();
      await completeProfileAndDocuments(session.accessToken, session.user.id);

      const student = await dataSource
        .getRepository(Student)
        .findOneOrFail({ where: { userId: session.user.id } });
      const uploaded = await dataSource
        .getRepository(Document)
        .find({ where: { studentId: student.id } });

      const created = await request(app.getHttpServer())
        .post('/v1/applications')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ courseId: publishedCourseId })
        .expect(201);

      for (const document of uploaded) {
        await request(app.getHttpServer())
          .post(`/v1/applications/${created.body.id}/documents/${document.id}`)
          .set('Authorization', `Bearer ${session.accessToken}`)
          .expect(200);
      }

      const submitted = await request(app.getHttpServer())
        .post(`/v1/applications/${created.body.id}/submit`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);

      expect(submitted.body.status).toBe('submitted');
      expect(submitted.body.submittedAt).not.toBeNull();

      const inboxRows = await dataSource
        .getRepository(Notification)
        .find({ where: { userId: session.user.id, type: 'application_submitted' } });
      expect(inboxRows).toHaveLength(1);
      expect(inboxRows[0]?.link).toBe(`/dashboard/applications/${created.body.id}`);

      expect(notifications.applicationSubmissions).toHaveLength(1);
      expect(notifications.applicationSubmissions[0]).toMatchObject({ to: session.user.email });

      await request(app.getHttpServer())
        .post(`/v1/applications/${created.body.id}/submit`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(409);
    });

    it('refuses to attach a document to an already-submitted application', async () => {
      const session = await registerStudent();
      await completeProfileAndDocuments(session.accessToken, session.user.id);

      const student = await dataSource
        .getRepository(Student)
        .findOneOrFail({ where: { userId: session.user.id } });
      const uploaded = await dataSource
        .getRepository(Document)
        .find({ where: { studentId: student.id } });

      const created = await request(app.getHttpServer())
        .post('/v1/applications')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ courseId: publishedCourseId })
        .expect(201);

      for (const document of uploaded) {
        await request(app.getHttpServer())
          .post(`/v1/applications/${created.body.id}/documents/${document.id}`)
          .set('Authorization', `Bearer ${session.accessToken}`)
          .expect(200);
      }

      await request(app.getHttpServer())
        .post(`/v1/applications/${created.body.id}/submit`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);

      const extraDocument = await dataSource.getRepository(Document).save(
        dataSource.getRepository(Document).create({
          tenantId: student.tenantId,
          studentId: student.id,
          type: DocumentType.Medical,
          status: DocumentStatus.Uploaded,
          originalFilename: 'medical.pdf',
          cloudinaryPublicId: `test/${Math.random().toString(36).slice(2, 10)}`,
        }),
      );

      await request(app.getHttpServer())
        .post(`/v1/applications/${created.body.id}/documents/${extraDocument.id}`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(409);
    });
  });

  describe('auto-assignment to the Success Manager pool, on submit', () => {
    async function createPoolAdmin(firstName: string): Promise<Admin> {
      const role = await dataSource.getRepository(AdminRole).save(
        dataSource.getRepository(AdminRole).create({
          name: `SM pool ${Math.random().toString(36).slice(2, 8)}`,
          isSuccessManagerPool: true,
        }),
      );
      return dataSource.getRepository(Admin).save(
        dataSource.getRepository(Admin).create({
          email: `sm-${Math.random().toString(36).slice(2, 8)}@example.com`,
          firstName,
          lastName: 'Manager',
          passwordHash: await new PasswordService().hash('correct-horse-battery'),
          status: UserStatus.Active,
          roleId: role.id,
        }),
      );
    }

    /** Registers a fresh student, completes their profile and documents, creates and attaches, then submits. */
    async function submitReadyApplication(): Promise<{ body: Record<string, unknown> }> {
      const session = await registerStudent();
      await completeProfileAndDocuments(session.accessToken, session.user.id);
      const student = await dataSource.getRepository(Student).findOneOrFail({ where: { userId: session.user.id } });
      const uploaded = await dataSource.getRepository(Document).find({ where: { studentId: student.id } });

      const created = await request(app.getHttpServer())
        .post('/v1/applications')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ courseId: publishedCourseId })
        .expect(201);

      for (const document of uploaded) {
        await request(app.getHttpServer())
          .post(`/v1/applications/${created.body.id}/documents/${document.id}`)
          .set('Authorization', `Bearer ${session.accessToken}`)
          .expect(200);
      }

      return request(app.getHttpServer())
        .post(`/v1/applications/${created.body.id}/submit`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);
    }

    /* First in the block, deliberately: every other test in here creates a
       pool admin that outlives its own `it()` (no truncation between them),
       so this is the only point at which the pool is actually empty. */
    it('leaves the application unassigned when the pool is empty', async () => {
      const submitted = await submitReadyApplication();
      expect(submitted.body.assignedAdminName).toBeNull();
    });

    it('assigns to the only admin in the pool, and reports their name back to the student', async () => {
      const admin = await createPoolAdmin('Solo');

      const submitted = await submitReadyApplication();

      expect(submitted.body.assignedAdminName).toBe('Solo Manager');
      const row = await dataSource
        .getRepository(Application)
        .findOneOrFail({ where: { id: submitted.body.id as string } });
      expect(row.assignedAdminId).toBe(admin.id);
    });

    it('picks the least-loaded admin in the pool', async () => {
      const busy = await createPoolAdmin('Busy');
      const givenToBusy = await submitReadyApplication();
      expect(givenToBusy.body.assignedAdminName).toBe('Busy Manager'); // busy is the only candidate so far

      const free = await createPoolAdmin('Free'); // now 1-loaded (busy) vs 0-loaded (free)

      const submitted = await submitReadyApplication();

      expect(submitted.body.assignedAdminName).toBe('Free Manager');
      const row = await dataSource
        .getRepository(Application)
        .findOneOrFail({ where: { id: submitted.body.id as string } });
      expect(row.assignedAdminId).toBe(free.id);
      expect(row.assignedAdminId).not.toBe(busy.id);
    });

    it('leaves a manually pre-assigned application alone', async () => {
      await createPoolAdmin('Pool'); // a non-empty pool — proves auto-assign was skipped, not just unavailable
      const { token: adminToken, adminId: preAssignedAdminId } = await seedAdminSession(app, [
        'applications.manage',
      ]);

      const session = await registerStudent();
      await completeProfileAndDocuments(session.accessToken, session.user.id);
      const student = await dataSource.getRepository(Student).findOneOrFail({ where: { userId: session.user.id } });
      const uploaded = await dataSource.getRepository(Document).find({ where: { studentId: student.id } });

      const created = await request(app.getHttpServer())
        .post('/v1/applications')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ courseId: publishedCourseId })
        .expect(201);

      for (const document of uploaded) {
        await request(app.getHttpServer())
          .post(`/v1/applications/${created.body.id}/documents/${document.id}`)
          .set('Authorization', `Bearer ${session.accessToken}`)
          .expect(200);
      }

      await request(app.getHttpServer())
        .patch(`/v1/admin/applications/${created.body.id}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ adminId: preAssignedAdminId })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/v1/applications/${created.body.id}/submit`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);

      const row = await dataSource.getRepository(Application).findOneOrFail({ where: { id: created.body.id } });
      expect(row.assignedAdminId).toBe(preAssignedAdminId);
    });
  });
});
