import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { createTestApp, truncateIdentity } from '../helpers/create-test-app';
import { DocumentStatus, DocumentType } from '../../src/contract/enums';
import { Document } from '../../src/modules/documents/entities/document.entity';
import { Student } from '../../src/modules/students/entities/student.entity';

describe('applications', () => {
  let app: INestApplication;
  let dataSource: DataSource;
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

  /** The required document types, all uploaded, for the calling student. */
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
          status: DocumentStatus.Uploaded,
          originalFilename: `${type}.pdf`,
          cloudinaryPublicId: `test/${Math.random().toString(36).slice(2, 10)}`,
          url: 'https://res.cloudinary.com/demo/raw/upload/v1/doc.pdf',
        }),
      );
    }
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
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
    it('attaches an uploaded document and reflects it in missingDocumentTypes', async () => {
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
      expect(attached.body.missingDocumentTypes).not.toContain('identity');

      const detached = await request(app.getHttpServer())
        .delete(`/v1/applications/${created.body.id}/documents/${document.id}`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);

      expect(detached.body.attachedDocumentIds).not.toContain(document.id);
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
});
