import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { createTestApp } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';

describe('admin: catalogue', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let institutionId: string;
  let draftInstitutionId: string;
  let courseId: string;
  let articleId: string;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);

    await dataSource.query('TRUNCATE TABLE "articles", "courses", "institutions" CASCADE');
    await dataSource.query(`
      INSERT INTO institutions (slug,name,aka,country,"countryCode",city,status,"fastTrackOffer") VALUES
        ('admin-probe-published','Published University','{}','United Kingdom','GB','Manchester','published',false),
        ('admin-probe-draft','Draft University','{}','United Kingdom','GB','Leeds','draft',false);
      INSERT INTO courses (slug,"institutionId",title,level,disciplines,"durationMonths",overview,status)
        SELECT 'admin-probe-course', id, 'MSc Probe', 'postgraduate', '{Computing}', 12, 'x', 'draft'
        FROM institutions WHERE slug='admin-probe-published';
      INSERT INTO articles (slug,title,body,tags,status) VALUES
        ('admin-probe-article','Probe Article','body text','{}','draft');
    `);

    institutionId = (
      await dataSource.query(`SELECT id FROM institutions WHERE slug = 'admin-probe-published'`)
    )[0].id;
    draftInstitutionId = (
      await dataSource.query(`SELECT id FROM institutions WHERE slug = 'admin-probe-draft'`)
    )[0].id;
    courseId = (await dataSource.query(`SELECT id FROM courses WHERE slug = 'admin-probe-course'`))[0].id;
    articleId = (await dataSource.query(`SELECT id FROM articles WHERE slug = 'admin-probe-article'`))[0].id;
  });

  afterAll(async () => {
    await dataSource.query('TRUNCATE TABLE "articles", "courses", "institutions" CASCADE');
    await app.close();
  });

  describe('institutions', () => {
    it('lists drafts, which the public endpoint never returns', async () => {
      const { token } = await seedAdminSession(app, ['catalogue.view']);

      const response = await request(app.getHttpServer())
        .get('/v1/admin/catalogue/institutions?status=draft')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.items.some((item: { id: string }) => item.id === draftInstitutionId)).toBe(true);

      const publicResponse = await request(app.getHttpServer()).get('/v1/catalogue/institutions').expect(200);
      expect(publicResponse.body.items.some((item: { id: string }) => item.id === draftInstitutionId)).toBe(
        false,
      );
    });

    it('publishes, suspends, and reverts to draft', async () => {
      const { token } = await seedAdminSession(app, ['catalogue.publish', 'catalogue.suspend']);

      const suspended = await request(app.getHttpServer())
        .post(`/v1/admin/catalogue/institutions/${draftInstitutionId}/suspend`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(suspended.body.status).toBe('suspended');

      const published = await request(app.getHttpServer())
        .post(`/v1/admin/catalogue/institutions/${draftInstitutionId}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(published.body.status).toBe('published');

      const reverted = await request(app.getHttpServer())
        .post(`/v1/admin/catalogue/institutions/${draftInstitutionId}/revert-to-draft`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(reverted.body.status).toBe('draft');
    });

    it('refuses to suspend without catalogue.suspend', async () => {
      const { token } = await seedAdminSession(app, ['catalogue.view']);

      await request(app.getHttpServer())
        .post(`/v1/admin/catalogue/institutions/${institutionId}/suspend`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('courses', () => {
    it('lists a draft course with its institution name', async () => {
      const { token } = await seedAdminSession(app, ['catalogue.view']);

      const response = await request(app.getHttpServer())
        .get('/v1/admin/catalogue/courses?status=draft')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const found = response.body.items.find((item: { id: string }) => item.id === courseId);
      expect(found).toMatchObject({ institutionName: 'Published University', status: 'draft' });
    });

    it('publishes a course', async () => {
      const { token } = await seedAdminSession(app, ['catalogue.publish']);

      const response = await request(app.getHttpServer())
        .post(`/v1/admin/catalogue/courses/${courseId}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.status).toBe('published');
    });
  });

  describe('articles', () => {
    it('lists and publishes a draft article', async () => {
      const { token } = await seedAdminSession(app, ['catalogue.view', 'catalogue.publish']);

      const list = await request(app.getHttpServer())
        .get('/v1/admin/catalogue/articles?status=draft')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(list.body.items.some((item: { id: string }) => item.id === articleId)).toBe(true);

      const published = await request(app.getHttpServer())
        .post(`/v1/admin/catalogue/articles/${articleId}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(published.body.status).toBe('published');
    });
  });
});
