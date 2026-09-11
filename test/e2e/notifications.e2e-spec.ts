import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { createTestApp, truncateIdentity } from '../helpers/create-test-app';
import { Notification } from '../../src/modules/notifications-inbox/entities/notification.entity';

describe('notifications', () => {
  let app: INestApplication;
  let accessToken: string;
  let userId: string;

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

  async function seedNotification(overrides: Partial<Notification> = {}): Promise<Notification> {
    const dataSource = app.get(DataSource);
    const repo = dataSource.getRepository(Notification);
    return repo.save(
      repo.create({
        userId,
        type: 'document_rejected',
        title: 'A document needs another look',
        body: 'Your identity was not accepted.',
        link: '/dashboard/documents',
        ...overrides,
      }),
    );
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    const session = await registerStudent();
    accessToken = session.accessToken;
    userId = session.user.id;
  });

  afterAll(async () => {
    await truncateIdentity(app);
    await app?.close();
  });

  describe('GET /v1/notifications', () => {
    it("lists only the caller's own notifications, newest first", async () => {
      const other = await registerStudent();
      await seedNotification();
      const mine = await seedNotification({ title: 'Most recent' });

      const response = await request(app.getHttpServer())
        .get('/v1/notifications')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body[0].id).toBe(mine.id);

      const othersList = await request(app.getHttpServer())
        .get('/v1/notifications')
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(200);
      expect(othersList.body).toEqual([]);
    });

    it('refuses an unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/v1/notifications').expect(401);
    });
  });

  describe('GET /v1/notifications/unread-count', () => {
    it('counts only unread notifications', async () => {
      await seedNotification();
      await seedNotification({ readAt: new Date() });

      const response = await request(app.getHttpServer())
        .get('/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /v1/notifications/:id/read', () => {
    it('marks one notification read, reflected in the unread count', async () => {
      const notification = await seedNotification();

      const before = await request(app.getHttpServer())
        .get('/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const marked = await request(app.getHttpServer())
        .post(`/v1/notifications/${notification.id}/read`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(marked.body.readAt).not.toBeNull();

      const after = await request(app.getHttpServer())
        .get('/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(after.body.count).toBe(before.body.count - 1);
    });

    it("refuses to mark another student's notification read", async () => {
      const notification = await seedNotification();
      const other = await registerStudent();

      await request(app.getHttpServer())
        .post(`/v1/notifications/${notification.id}/read`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(404);
    });
  });
});
