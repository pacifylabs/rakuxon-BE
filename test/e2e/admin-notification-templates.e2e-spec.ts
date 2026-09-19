import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { createTestApp } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';
import { NotificationTemplate } from '../../src/modules/notification-templates/entities/notification-template.entity';

/**
 * The six rows here are seed data (migration `NotificationTemplates...`),
 * not per-test fixtures — `truncateAll()` deliberately leaves this table
 * alone, the same way it leaves `permissions` alone. Every test that edits a
 * row restores it in a `finally`, so this file never leaks state into
 * whichever e2e file `--runInBand` happens to run next.
 */
describe('admin: notification templates', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  async function findByKey(key: string): Promise<NotificationTemplate> {
    return dataSource.getRepository(NotificationTemplate).findOneOrFail({ where: { key } });
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('GET /v1/admin/notification-templates', () => {
    it('lists every seeded template', async () => {
      const { token } = await seedAdminSession(app, ['notifications.view']);

      const response = await request(app.getHttpServer())
        .get('/v1/admin/notification-templates')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const keys = response.body.map((row: { key: string }) => row.key).sort();
      expect(keys).toEqual([
        'application_submitted',
        'case_assigned',
        'document_approved',
        'document_rejected',
        'email_verification',
        'password_reset',
      ]);
    });

    it('refuses a token without notifications.view', async () => {
      const { token } = await seedAdminSession(app, []);
      await request(app.getHttpServer())
        .get('/v1/admin/notification-templates')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('refuses an unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/v1/admin/notification-templates').expect(401);
    });
  });

  describe('GET /v1/admin/notification-templates/:id', () => {
    it("returns the row's copy plus the tokens its call site actually fills in", async () => {
      const row = await findByKey('case_assigned');
      const { token } = await seedAdminSession(app, ['notifications.view']);

      const response = await request(app.getHttpServer())
        .get(`/v1/admin/notification-templates/${row.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toMatchObject({ key: 'case_assigned', channel: 'both', enabled: true });
      expect(response.body.availableTokens.sort()).toEqual(
        ['courseName', 'institutionName', 'reviewUrl', 'studentName'].sort(),
      );
    });
  });

  describe('PATCH /v1/admin/notification-templates/:id', () => {
    it("edits a row's copy and persists it", async () => {
      const row = await findByKey('document_approved');
      const { token } = await seedAdminSession(app, ['notifications.manage', 'notifications.view']);

      try {
        const response = await request(app.getHttpServer())
          .patch(`/v1/admin/notification-templates/${row.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ heading: 'Great news about your document' })
          .expect(200);

        expect(response.body.heading).toBe('Great news about your document');

        const persisted = await request(app.getHttpServer())
          .get(`/v1/admin/notification-templates/${row.id}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        expect(persisted.body.heading).toBe('Great news about your document');
      } finally {
        await dataSource
          .getRepository(NotificationTemplate)
          .update(row.id, { heading: row.heading, body: row.body, enabled: row.enabled });
      }
    });

    it('refuses a token without notifications.manage', async () => {
      const row = await findByKey('document_approved');
      const { token } = await seedAdminSession(app, ['notifications.view']);

      await request(app.getHttpServer())
        .patch(`/v1/admin/notification-templates/${row.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ heading: 'Should not apply' })
        .expect(403);
    });

    it('404s for an unknown id', async () => {
      const { token } = await seedAdminSession(app, ['notifications.manage']);
      await request(app.getHttpServer())
        .patch('/v1/admin/notification-templates/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .send({ heading: 'X' })
        .expect(404);
    });
  });

  describe('POST /v1/admin/notification-templates/:id/preview', () => {
    it("renders the editor's in-progress fields against sample data, without saving them", async () => {
      const row = await findByKey('case_assigned');
      const { token } = await seedAdminSession(app, ['notifications.manage']);

      const response = await request(app.getHttpServer())
        .post(`/v1/admin/notification-templates/${row.id}/preview`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          heading: 'Draft heading for {{studentName}}',
          body: ['Draft paragraph mentioning {{courseName}}.'],
          ctaLabel: 'Open',
          ctaUrl: '{{reviewUrl}}',
        })
        .expect(200);

      expect(response.body.inAppTitle).toBe('Draft heading for Ada Lovelace');
      expect(response.body.inAppBody).toContain('BSc Computer Science');
      expect(response.body.html).toContain('Draft heading for Ada Lovelace');
      expect(response.body.html).toContain('href="https://admin.rakuxon.com/dashboard/applications/sample-id"');

      const persisted = await dataSource.getRepository(NotificationTemplate).findOneOrFail({ where: { id: row.id } });
      expect(persisted.heading).toBe(row.heading);
    });
  });
});
