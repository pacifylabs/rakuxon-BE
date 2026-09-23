import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { createTestApp, truncateIdentity, uniqueSlug } from '../helpers/create-test-app';
import { DocumentStatus, DocumentType, Role, UserStatus } from '../../src/contract/enums';
import { Document } from '../../src/modules/documents/entities/document.entity';
import { User } from '../../src/modules/users/entities/user.entity';

describe('agency: partner-app self-service', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let tenantAId: string;
  let adminATokenA: string;
  let counselorATokenA: string;

  let adminBTokenB: string;

  let studentAId: string;
  let applicationAId: string;

  async function registerAgency() {
    const slug = uniqueSlug();
    const { body } = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        agencyName: 'Northwind Education',
        slug,
        email: `admin@${slug}.example`,
        firstName: 'Ada',
        lastName: 'Lovelace',
        password: 'correct-horse-battery',
      })
      .expect(201);
    return body;
  }

  /** A counselor in the given tenant, promoted directly rather than via the invite flow under test. */
  async function addCounselor(tenant: string): Promise<string> {
    const repo = dataSource.getRepository(User);
    const email = `counselor-${Math.random().toString(36).slice(2, 8)}@example.com`;

    const admin = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        agencyName: 'Temp',
        slug: uniqueSlug('temp'),
        email: `t-${email}`,
        firstName: 'Temp',
        lastName: 'Counselor',
        password: 'correct-horse-battery',
      })
      .expect(201);

    await repo.update(
      { id: admin.body.user.id },
      { tenantId: tenant, role: Role.Counselor, status: UserStatus.Active },
    );

    const relogin = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: `t-${email}`, password: 'correct-horse-battery' })
      .expect(200);

    return relogin.body.accessToken;
  }

  async function registerStudentInTenant(tenant: string) {
    const email = `student-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const { body } = await request(app.getHttpServer())
      .post('/v1/auth/register/student')
      .send({ email, firstName: 'Grace', lastName: 'Hopper', password: 'correct-horse-battery' })
      .expect(201);

    await dataSource.getRepository(User).update({ id: body.user.id }, { tenantId: tenant });
    await dataSource.query(`UPDATE students SET "tenantId" = $1 WHERE "userId" = $2`, [tenant, body.user.id]);
    const relogin = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: 'correct-horse-battery' })
      .expect(200);

    const studentId = (
      await dataSource.query(`SELECT id FROM students WHERE "userId" = $1`, [body.user.id])
    )[0].id;

    return { accessToken: relogin.body.accessToken as string, studentId: studentId as string };
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);

    const sessionA = await registerAgency();
    tenantAId = sessionA.user.tenantId;
    adminATokenA = sessionA.accessToken;
    counselorATokenA = await addCounselor(tenantAId);

    const sessionB = await registerAgency();
    adminBTokenB = sessionB.accessToken;

    await dataSource.query('TRUNCATE TABLE "courses", "institutions" CASCADE');
    await dataSource.query(`
      INSERT INTO institutions (slug, name, aka, country, "countryCode", status) VALUES
        ('agency-probe-institution', 'Probe University', '{}', 'United Kingdom', 'GB', 'published');
      INSERT INTO courses (slug, "institutionId", title, level, "durationMonths", overview, status, intakes)
        SELECT 'agency-probe-course', id, 'MSc Probing', 'postgraduate', 12, 'x', 'published', '[]'
        FROM institutions WHERE slug = 'agency-probe-institution';
    `);
    const courseId = (
      await dataSource.query(`SELECT id FROM courses WHERE slug = 'agency-probe-course'`)
    )[0].id;

    const studentA = await registerStudentInTenant(tenantAId);
    studentAId = studentA.studentId;

    const created = await request(app.getHttpServer())
      .post('/v1/applications')
      .set('Authorization', `Bearer ${studentA.accessToken}`)
      .send({ courseId })
      .expect(201);
    applicationAId = created.body.id;
  });

  afterAll(async () => {
    await dataSource.query('TRUNCATE TABLE "courses", "institutions" CASCADE');
    await truncateIdentity(app);
    await app?.close();
  });

  describe('dashboard', () => {
    it("returns only the caller's own tenant totals", async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/agency/dashboard/summary')
        .set('Authorization', `Bearer ${adminATokenA}`)
        .expect(200);

      expect(response.body).toMatchObject({ tenantId: tenantAId, totalStudents: 1, totalApplications: 1 });
    });

    it('refuses an unauthenticated caller', async () => {
      await request(app.getHttpServer()).get('/v1/agency/dashboard/summary').expect(401);
    });
  });

  describe('students', () => {
    it("lists only the caller's own tenant's students", async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/agency/students')
        .set('Authorization', `Bearer ${adminATokenA}`)
        .expect(200);

      expect(response.body.items.some((item: { id: string }) => item.id === studentAId)).toBe(true);
    });

    it('a counselor can read the same list as the agency_admin', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/agency/students')
        .set('Authorization', `Bearer ${counselorATokenA}`)
        .expect(200);

      expect(response.body.items.some((item: { id: string }) => item.id === studentAId)).toBe(true);
    });

    it("404s, not 403s, for another agency's student", async () => {
      await request(app.getHttpServer())
        .get(`/v1/agency/students/${studentAId}`)
        .set('Authorization', `Bearer ${adminBTokenB}`)
        .expect(404);
    });

    it('returns the detail for its own student', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/agency/students/${studentAId}`)
        .set('Authorization', `Bearer ${adminATokenA}`)
        .expect(200);

      expect(response.body.id).toBe(studentAId);
    });
  });

  describe('bringing a student in directly', () => {
    it('creates the student in the caller\'s own tenant, unverified', async () => {
      const email = `direct-${Math.random().toString(36).slice(2, 8)}@example.com`;

      const response = await request(app.getHttpServer())
        .post('/v1/agency/students')
        .set('Authorization', `Bearer ${adminATokenA}`)
        .send({ email, firstName: 'New', lastName: 'Direct', password: 'correct-horse-battery' })
        .expect(201);

      expect(response.body).toMatchObject({ email, tenantId: tenantAId });

      const row = await dataSource
        .getRepository(User)
        .findOne({ where: { email, tenantId: tenantAId } });
      expect(row?.emailVerifiedAt).toBeNull();

      // The password is real — the student can sign in with it immediately.
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password: 'correct-horse-battery' })
        .expect(200);
    });

    it("refuses an email already registered in the caller's tenant", async () => {
      const email = `dup-${Math.random().toString(36).slice(2, 8)}@example.com`;
      await request(app.getHttpServer())
        .post('/v1/agency/students')
        .set('Authorization', `Bearer ${adminATokenA}`)
        .send({ email, firstName: 'First', lastName: 'One', password: 'correct-horse-battery' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/v1/agency/students')
        .set('Authorization', `Bearer ${adminATokenA}`)
        .send({ email, firstName: 'Second', lastName: 'One', password: 'correct-horse-battery' })
        .expect(409);
    });

    it('refuses an unauthenticated caller', async () => {
      await request(app.getHttpServer())
        .post('/v1/agency/students')
        .send({
          email: 'nope@example.com',
          firstName: 'No',
          lastName: 'Auth',
          password: 'correct-horse-battery',
        })
        .expect(401);
    });
  });

  describe('applications', () => {
    it("lists only the caller's own tenant's applications", async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/agency/applications')
        .set('Authorization', `Bearer ${adminATokenA}`)
        .expect(200);

      expect(response.body.items.some((item: { id: string }) => item.id === applicationAId)).toBe(true);
    });

    it('filters by studentId, for a student detail screen', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/agency/applications?studentId=${studentAId}`)
        .set('Authorization', `Bearer ${adminATokenA}`)
        .expect(200);

      expect(response.body.items.every((item: { id: string }) => item.id === applicationAId)).toBe(
        true,
      );
      expect(response.body.items.length).toBeGreaterThan(0);
    });

    it("404s for another agency's application", async () => {
      await request(app.getHttpServer())
        .get(`/v1/agency/applications/${applicationAId}`)
        .set('Authorization', `Bearer ${adminBTokenB}`)
        .expect(404);
    });

    it('attaches and detaches an already-uploaded document', async () => {
      const document = await dataSource.getRepository(Document).save(
        dataSource.getRepository(Document).create({
          tenantId: tenantAId,
          studentId: studentAId,
          type: DocumentType.Identity,
          status: DocumentStatus.Uploaded,
          originalFilename: 'passport.pdf',
          cloudinaryPublicId: `test/${Math.random().toString(36).slice(2, 10)}`,
          url: 'https://res.cloudinary.com/demo/raw/upload/v1/passport.pdf',
        }),
      );

      const listed = await request(app.getHttpServer())
        .get(`/v1/agency/students/${studentAId}/documents`)
        .set('Authorization', `Bearer ${adminATokenA}`)
        .expect(200);
      expect(listed.body.some((entry: { id: string }) => entry.id === document.id)).toBe(true);

      await request(app.getHttpServer())
        .get(`/v1/agency/students/${studentAId}/documents`)
        .set('Authorization', `Bearer ${adminBTokenB}`)
        .expect(404);

      const attached = await request(app.getHttpServer())
        .post(`/v1/agency/applications/${applicationAId}/documents/${document.id}`)
        .set('Authorization', `Bearer ${adminATokenA}`)
        .expect(200);
      expect(attached.body.attachedDocumentIds).toContain(document.id);

      const detached = await request(app.getHttpServer())
        .delete(`/v1/agency/applications/${applicationAId}/documents/${document.id}`)
        .set('Authorization', `Bearer ${adminATokenA}`)
        .expect(200);
      expect(detached.body.attachedDocumentIds).not.toContain(document.id);
    });

    it('has no approve or reject route reachable by an agency role', async () => {
      await request(app.getHttpServer())
        .post(`/v1/agency/applications/${applicationAId}/approve`)
        .set('Authorization', `Bearer ${adminATokenA}`)
        .expect(404);

      await request(app.getHttpServer())
        .post(`/v1/agency/documents/00000000-0000-0000-0000-000000000000/approve`)
        .set('Authorization', `Bearer ${adminATokenA}`)
        .expect(404);
    });

    describe('submitting on a student\'s behalf', () => {
      async function readyToSubmitApplication() {
        const student = await registerStudentInTenant(tenantAId);
        await request(app.getHttpServer())
          .patch('/v1/students/me')
          .set('Authorization', `Bearer ${student.accessToken}`)
          .send({
            dateOfBirth: '2000-01-01',
            nationality: 'NG',
            phone: '+2348012345678',
            intendedStudyLevel: 'postgraduate',
            intendedCountry: 'GB',
            preferredIntake: '2026-09',
            educationHistory: [{ institutionName: 'Prior School', qualification: 'BSc' }],
          })
          .expect(200);

        const courseId = (
          await dataSource.query(`SELECT id FROM courses WHERE slug = 'agency-probe-course'`)
        )[0].id;
        const created = await request(app.getHttpServer())
          .post('/v1/applications')
          .set('Authorization', `Bearer ${student.accessToken}`)
          .send({ courseId })
          .expect(201);
        const appId = created.body.id as string;

        for (const type of [
          DocumentType.Identity,
          DocumentType.AcademicCertificate,
          DocumentType.EnglishTest,
        ]) {
          const document = await dataSource.getRepository(Document).save(
            dataSource.getRepository(Document).create({
              tenantId: tenantAId,
              studentId: student.studentId,
              type,
              status: DocumentStatus.Approved,
              originalFilename: 'file.pdf',
              cloudinaryPublicId: `test/${Math.random().toString(36).slice(2, 10)}`,
              url: 'https://res.cloudinary.com/demo/raw/upload/v1/file.pdf',
            }),
          );
          await request(app.getHttpServer())
            .post(`/v1/agency/applications/${appId}/documents/${document.id}`)
            .set('Authorization', `Bearer ${adminATokenA}`)
            .expect(200);
        }

        return appId;
      }

      it('submits once the profile is complete and every document is approved', async () => {
        const appId = await readyToSubmitApplication();

        const response = await request(app.getHttpServer())
          .post(`/v1/agency/applications/${appId}/submit`)
          .set('Authorization', `Bearer ${adminATokenA}`)
          .expect(200);

        expect(response.body.status).toBe('submitted');
        expect(response.body.submittedAt).not.toBeNull();
      });

      it('refuses a second submission', async () => {
        const appId = await readyToSubmitApplication();
        await request(app.getHttpServer())
          .post(`/v1/agency/applications/${appId}/submit`)
          .set('Authorization', `Bearer ${adminATokenA}`)
          .expect(200);

        await request(app.getHttpServer())
          .post(`/v1/agency/applications/${appId}/submit`)
          .set('Authorization', `Bearer ${adminATokenA}`)
          .expect(409);
      });

      it('refuses a draft still missing a required document', async () => {
        await request(app.getHttpServer())
          .post(`/v1/agency/applications/${applicationAId}/submit`)
          .set('Authorization', `Bearer ${adminATokenA}`)
          .expect(400);
      });

      it("404s for another agency's application", async () => {
        const appId = await readyToSubmitApplication();
        await request(app.getHttpServer())
          .post(`/v1/agency/applications/${appId}/submit`)
          .set('Authorization', `Bearer ${adminBTokenB}`)
          .expect(404);
      });
    });
  });

  describe('staff self-service', () => {
    it('lets an agency_admin invite a counselor into their own tenant', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/agency/staff')
        .set('Authorization', `Bearer ${adminATokenA}`)
        .send({
          email: `new-counselor-${Math.random().toString(36).slice(2, 8)}@example.com`,
          firstName: 'New',
          lastName: 'Counselor',
          password: 'correct-horse-battery',
        })
        .expect(201);

      // Self-service can never mint a second agency_admin.
      expect(response.body.role).toBe('counselor');
    });

    it('refuses a counselor trying to invite staff', async () => {
      await request(app.getHttpServer())
        .post('/v1/agency/staff')
        .set('Authorization', `Bearer ${counselorATokenA}`)
        .send({
          email: `blocked-${Math.random().toString(36).slice(2, 8)}@example.com`,
          firstName: 'Blocked',
          lastName: 'Counselor',
          password: 'correct-horse-battery',
        })
        .expect(403);
    });

    it('lets a counselor read the staff list, but not suspend a colleague', async () => {
      const list = await request(app.getHttpServer())
        .get('/v1/agency/staff')
        .set('Authorization', `Bearer ${counselorATokenA}`)
        .expect(200);
      expect(list.body.items.length).toBeGreaterThan(0);

      const someoneId = list.body.items[0].id as string;
      await request(app.getHttpServer())
        .post(`/v1/agency/staff/${someoneId}/suspend`)
        .set('Authorization', `Bearer ${counselorATokenA}`)
        .expect(403);
    });

    it('suspends and reactivates a colleague as agency_admin', async () => {
      const list = await request(app.getHttpServer())
        .get('/v1/agency/staff')
        .set('Authorization', `Bearer ${adminATokenA}`)
        .expect(200);
      const colleague = list.body.items.find((item: { role: string }) => item.role === 'counselor');

      const suspended = await request(app.getHttpServer())
        .post(`/v1/agency/staff/${colleague.id}/suspend`)
        .set('Authorization', `Bearer ${adminATokenA}`)
        .expect(200);
      expect(suspended.body.status).toBe('suspended');

      const reactivated = await request(app.getHttpServer())
        .post(`/v1/agency/staff/${colleague.id}/reactivate`)
        .set('Authorization', `Bearer ${adminATokenA}`)
        .expect(200);
      expect(reactivated.body.status).toBe('active');
    });

    it("404s trying to suspend another agency's staff", async () => {
      const list = await request(app.getHttpServer())
        .get('/v1/agency/staff')
        .set('Authorization', `Bearer ${adminBTokenB}`)
        .expect(200);
      const otherAgencyAdminId = list.body.items[0].id as string;

      await request(app.getHttpServer())
        .post(`/v1/agency/staff/${otherAgencyAdminId}/suspend`)
        .set('Authorization', `Bearer ${adminATokenA}`)
        .expect(404);
    });
  });
});
