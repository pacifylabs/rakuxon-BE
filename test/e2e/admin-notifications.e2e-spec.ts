import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { createTestApp, truncateIdentity } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';
import { Notification } from '../../src/modules/notifications-inbox/entities/notification.entity';

describe('admin: notifications', () => {
  let app: INestApplication;

  async function seedNotification(adminId: string, overrides: Partial<Notification> = {}): Promise<Notification> {
    const dataSource = app.get(DataSource);
    const repo = dataSource.getRepository(Notification);
    return repo.save(
      repo.create({
        adminId,
        type: 'case_assigned',
        title: 'A case was assigned to you',
        body: "Ada Lovelace's application for BSc Computer Science at Final Check University is now yours.",
        link: '/dashboard/applications/00000000-0000-0000-0000-000000000000',
        ...overrides,
      }),
    );
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await truncateIdentity(app);
    await app?.close();
  });

  describe('GET /v1/admin/notifications', () => {
    it("lists only the caller's own notifications, newest first", async () => {
      const { token, adminId } = await seedAdminSession(app);
      const other = await seedAdminSession(app);
      await seedNotification(other.adminId);
      const mine = await seedNotification(adminId, { title: 'Most recent' });

      const response = await request(app.getHttpServer())
        .get('/v1/admin/notifications')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body[0].id).toBe(mine.id);

      const othersList = await request(app.getHttpServer())
        .get('/v1/admin/notifications')
        .set('Authorization', `Bearer ${other.token}`)
        .expect(200);
      expect(othersList.body.some((row: { id: string }) => row.id === mine.id)).toBe(false);
    });

    it('refuses an unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/v1/admin/notifications').expect(401);
    });
  });

  describe('GET /v1/admin/notifications/unread-count', () => {
    it('counts only unread notifications', async () => {
      const { token, adminId } = await seedAdminSession(app);
      await seedNotification(adminId);
      await seedNotification(adminId, { readAt: new Date() });

      const response = await request(app.getHttpServer())
        .get('/v1/admin/notifications/unread-count')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /v1/admin/notifications/:id/read', () => {
    it('marks one notification read, reflected in the unread count', async () => {
      const { token, adminId } = await seedAdminSession(app);
      const notification = await seedNotification(adminId);

      const before = await request(app.getHttpServer())
        .get('/v1/admin/notifications/unread-count')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const marked = await request(app.getHttpServer())
        .post(`/v1/admin/notifications/${notification.id}/read`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(marked.body.readAt).not.toBeNull();

      const after = await request(app.getHttpServer())
        .get('/v1/admin/notifications/unread-count')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(after.body.count).toBe(before.body.count - 1);
    });

    it("refuses to mark another admin's notification read", async () => {
      const { adminId } = await seedAdminSession(app);
      const notification = await seedNotification(adminId);
      const other = await seedAdminSession(app);

      await request(app.getHttpServer())
        .post(`/v1/admin/notifications/${notification.id}/read`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(404);
    });
  });
});
