import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { CapturingNotifications, createTestApp, truncateIdentity } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';
import { HOUSE_TENANT_ID } from '../../src/contract/constants';
import { Notification } from '../../src/modules/notifications-inbox/entities/notification.entity';

describe('messaging', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let notifications: CapturingNotifications;
  let publishedCourseId: string;

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

  /** Creates a draft application for `session` and assigns it to `adminId` — enough to make that admin "assigned" for messaging purposes; readiness to submit is irrelevant here. */
  async function assignedApplication(session: { accessToken: string }, managerToken: string, adminId: string) {
    const created = await request(app.getHttpServer())
      .post('/v1/applications')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ courseId: publishedCourseId })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/v1/admin/applications/${created.body.id}/assign`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ adminId })
      .expect(200);
    return created.body.id as string;
  }

  beforeAll(async () => {
    ({ app, notifications } = await createTestApp());
    dataSource = app.get(DataSource);

    await dataSource.query('TRUNCATE TABLE "courses", "institutions" CASCADE');
    await dataSource.query(`
      INSERT INTO institutions (slug, name, aka, country, "countryCode", status) VALUES
        ('probe-msg-institution', 'Probe University', '{}', 'United Kingdom', 'GB', 'published');
      INSERT INTO courses (slug, "institutionId", title, level, "durationMonths", overview, status, intakes)
        SELECT 'probe-msg-course', id, 'MSc Probing', 'postgraduate', 12, 'x', 'published', '[]'
        FROM institutions WHERE slug = 'probe-msg-institution';
    `);
    const [{ id }] = await dataSource.query(`SELECT id FROM courses WHERE slug = 'probe-msg-course'`);
    publishedCourseId = id;
  });

  afterAll(async () => {
    await dataSource.query('TRUNCATE TABLE "courses", "institutions" CASCADE');
    await truncateIdentity(app);
    await app?.close();
  });

  describe('student side', () => {
    it("lists the admins currently assigned across the student's own applications", async () => {
      const session = await registerStudent();
      const { token: managerToken } = await seedAdminSession(app, ['applications.manage']);
      const { adminId } = await seedAdminSession(app, []);
      await assignedApplication(session, managerToken, adminId);

      const response = await request(app.getHttpServer())
        .get('/v1/messages/assigned-admins')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);

      expect(response.body.map((row: { id: string }) => row.id)).toContain(adminId);
    });

    it('starts a conversation with an assigned admin, in-app-notifying and emailing them', async () => {
      const session = await registerStudent();
      const { token: managerToken } = await seedAdminSession(app, ['applications.manage']);
      const { adminId } = await seedAdminSession(app, []);
      await assignedApplication(session, managerToken, adminId);

      const response = await request(app.getHttpServer())
        .post('/v1/messages/conversations')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ adminId, body: 'Hello, quick question about my application.' })
        .expect(200);

      expect(response.body.messages).toHaveLength(1);
      expect(response.body.messages[0]).toMatchObject({ senderType: 'student', body: expect.stringContaining('Hello') });

      const inboxRows = await dataSource
        .getRepository(Notification)
        .find({ where: { adminId, type: 'new_message' } });
      expect(inboxRows).toHaveLength(1);

      expect(notifications.newMessages).toHaveLength(1);
      expect(notifications.newMessages[0]).toMatchObject({ preview: expect.stringContaining('Hello') });
    });

    it('refuses to start a conversation with an admin not currently assigned to the student', async () => {
      const session = await registerStudent();
      const { adminId } = await seedAdminSession(app, []); // never assigned to anything

      await request(app.getHttpServer())
        .post('/v1/messages/conversations')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ adminId, body: 'Hi?' })
        .expect(403);
    });

    it("replies on an existing conversation, marking the admin's earlier messages read", async () => {
      const session = await registerStudent();
      const { token: managerToken } = await seedAdminSession(app, ['applications.manage', 'messaging.manage']);
      const { token: adminToken, adminId } = await seedAdminSession(app, []);
      await assignedApplication(session, managerToken, adminId);

      const started = await request(app.getHttpServer())
        .post('/v1/messages/conversations')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ adminId, body: 'Opening message.' })
        .expect(200);
      const conversationId = started.body.id as string;

      await dataSource.query('UPDATE conversations SET "updatedAt" = $1 WHERE id = $2', [
        new Date('2020-01-01T00:00:00Z'), conversationId,
      ]);

      await request(app.getHttpServer())
        .post(`/v1/admin/messages/conversations/${conversationId}/reply`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ body: 'Admin reply.' })
        .expect(200);

      const [activeConversation] = await dataSource.query(
        'SELECT "updatedAt" FROM conversations WHERE id = $1', [conversationId],
      );
      expect(new Date(activeConversation.updatedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);

      const reply = await request(app.getHttpServer())
        .post(`/v1/messages/conversations/${conversationId}/reply`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ body: 'Thanks!' })
        .expect(200);

      expect(reply.body.messages.map((m: { senderType: string; body: string }) => m.body)).toEqual([
        'Opening message.',
        'Admin reply.',
        'Thanks!',
      ]);
      // Reading the thread as the student should have marked the admin's message read.
      expect(reply.body.messages[1].readAt).not.toBeNull();
    });

    it("404s for a conversation that belongs to another student", async () => {
      const session = await registerStudent();
      const other = await registerStudent();
      const { token: managerToken } = await seedAdminSession(app, ['applications.manage']);
      const { adminId } = await seedAdminSession(app, []);
      await assignedApplication(session, managerToken, adminId);

      const started = await request(app.getHttpServer())
        .post('/v1/messages/conversations')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ adminId, body: 'Mine.' })
        .expect(200);

      await request(app.getHttpServer())
        .get(`/v1/messages/conversations/${started.body.id}`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(404);
    });
  });

  describe('admin side', () => {
    it("lists and reads only the caller's own conversations", async () => {
      const session = await registerStudent();
      const { token: managerToken } = await seedAdminSession(app, ['applications.manage']);
      const { adminId: mine } = await seedAdminSession(app, []);
      const { token: otherAdminToken } = await seedAdminSession(app, []);
      await assignedApplication(session, managerToken, mine);

      const started = await request(app.getHttpServer())
        .post('/v1/messages/conversations')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ adminId: mine, body: 'For the right admin only.' })
        .expect(200);

      const othersList = await request(app.getHttpServer())
        .get('/v1/admin/messages/conversations')
        .set('Authorization', `Bearer ${otherAdminToken}`)
        .expect(200);
      expect(othersList.body.some((row: { id: string }) => row.id === started.body.id)).toBe(false);

      await request(app.getHttpServer())
        .get(`/v1/admin/messages/conversations/${started.body.id}`)
        .set('Authorization', `Bearer ${otherAdminToken}`)
        .expect(404);
    });

    it('replies on its own conversation, notifying the student', async () => {
      const session = await registerStudent();
      const { token: managerToken } = await seedAdminSession(app, ['applications.manage']);
      const { token: adminToken, adminId } = await seedAdminSession(app, []);
      await assignedApplication(session, managerToken, adminId);

      const started = await request(app.getHttpServer())
        .post('/v1/messages/conversations')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ adminId, body: 'Question.' })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/v1/admin/messages/conversations/${started.body.id}/reply`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ body: 'Answer.' })
        .expect(200);

      expect(notifications.newMessages.some((m) => m.preview === 'Answer.')).toBe(true);
    });

    it('refuses to compose without messaging.manage', async () => {
      const { token } = await seedAdminSession(app, []);
      await request(app.getHttpServer())
        .post('/v1/admin/messages/compose')
        .set('Authorization', `Bearer ${token}`)
        .send({ scope: 'all', body: 'x' })
        .expect(403);
    });

    it('composes a message to one specific student', async () => {
      const session = await registerStudent();
      const student = await dataSource.query('SELECT id FROM students ORDER BY "createdAt" DESC LIMIT 1');
      const studentId = student[0].id as string;
      const { token } = await seedAdminSession(app, ['messaging.manage']);

      const response = await request(app.getHttpServer())
        .post('/v1/admin/messages/compose')
        .set('Authorization', `Bearer ${token}`)
        .send({ scope: 'student', studentId, body: 'Targeted announcement.' })
        .expect(200);

      expect(response.body.recipientCount).toBe(1);

      const list = await request(app.getHttpServer())
        .get('/v1/messages/conversations')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);
      expect(list.body[0]).toMatchObject({ lastMessage: 'Targeted announcement.', unreadCount: 1 });
    });

    it('composes a broadcast to every student of a tenant', async () => {
      await registerStudent();
      await registerStudent();
      const { token } = await seedAdminSession(app, ['messaging.manage']);

      const response = await request(app.getHttpServer())
        .post('/v1/admin/messages/compose')
        .set('Authorization', `Bearer ${token}`)
        .send({ scope: 'tenant', tenantId: HOUSE_TENANT_ID, body: 'Tenant-wide notice.' })
        .expect(200);

      const [{ count }] = await dataSource.query('SELECT COUNT(*)::int AS count FROM students');
      expect(response.body.recipientCount).toBe(count);
    });

    it('composes to every student with a submitted application, and to no one when nobody has one', async () => {
      const submittedSession = await registerStudent();
      const draftOnlySession = await registerStudent();
      const { token: managerToken } = await seedAdminSession(app, ['applications.manage']);
      const { adminId } = await seedAdminSession(app, []);

      const submittedAppId = await assignedApplication(submittedSession, managerToken, adminId);
      await dataSource.query('UPDATE applications SET status = $1 WHERE id = $2', ['submitted', submittedAppId]);
      await assignedApplication(draftOnlySession, managerToken, adminId); // stays draft

      const { token } = await seedAdminSession(app, ['messaging.manage']);
      const response = await request(app.getHttpServer())
        .post('/v1/admin/messages/compose')
        .set('Authorization', `Bearer ${token}`)
        .send({ scope: 'status', status: 'submitted', body: 'Your application is under review.' })
        .expect(200);

      expect(response.body.recipientCount).toBe(1);

      const submittedList = await request(app.getHttpServer())
        .get('/v1/messages/conversations')
        .set('Authorization', `Bearer ${submittedSession.accessToken}`)
        .expect(200);
      expect(submittedList.body).toHaveLength(1);

      const draftOnlyList = await request(app.getHttpServer())
        .get('/v1/messages/conversations')
        .set('Authorization', `Bearer ${draftOnlySession.accessToken}`)
        .expect(200);
      expect(draftOnlyList.body).toHaveLength(0);
    });
  });
    it('shows counterpart presence after authenticated heartbeats', async () => {
      const session = await registerStudent();
      const { token: adminToken, adminId } = await seedAdminSession(app, ['applications.manage']);
      await assignedApplication(session, adminToken, adminId);

      const before = await request(app.getHttpServer())
        .get('/v1/messages/assigned-admins')
        .set('Authorization', `Bearer ${session.accessToken}`).expect(200);
      expect(before.body.find((row: { id: string }) => row.id === adminId).online).toBe(false);

      await request(app.getHttpServer()).post('/v1/admin/account/me/heartbeat')
        .set('Authorization', `Bearer ${adminToken}`).expect(204);
      await request(app.getHttpServer()).post('/v1/students/me/heartbeat')
        .set('Authorization', `Bearer ${session.accessToken}`).expect(204);

      const after = await request(app.getHttpServer())
        .get('/v1/messages/assigned-admins')
        .set('Authorization', `Bearer ${session.accessToken}`).expect(200);
      expect(after.body.find((row: { id: string }) => row.id === adminId).online).toBe(true);

      const started = await request(app.getHttpServer())
        .post('/v1/messages/conversations')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ adminId, body: 'Presence check.' }).expect(200);
      expect(started.body.counterpartOnline).toBe(true);
      const detail = await request(app.getHttpServer())
        .get(`/v1/admin/messages/conversations/${started.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`).expect(200);
      expect(detail.body.counterpartOnline).toBe(true);
    });

    it('rejects unauthenticated presence updates', async () => {
      await request(app.getHttpServer()).post('/v1/admin/account/me/heartbeat').expect(401);
      await request(app.getHttpServer()).post('/v1/students/me/heartbeat').expect(401);
    });


});
