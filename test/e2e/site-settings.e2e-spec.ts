import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { createTestApp } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';

describe('site settings', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);
    await dataSource.query('TRUNCATE TABLE "site_settings" CASCADE');
  });

  afterEach(async () => {
    await dataSource.query('TRUNCATE TABLE "site_settings" CASCADE');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('public read', () => {
    it('does not require authentication', async () => {
      await request(app.getHttpServer()).get('/v1/site-settings').expect(200);
    });

    it('creates a default row on first read, rather than 404ing', async () => {
      const response = await request(app.getHttpServer()).get('/v1/site-settings').expect(200);

      expect(response.body).toMatchObject({
        contactEmail: expect.any(String),
        contactPhones: expect.any(Array),
        contactAddresses: expect.any(Array),
        socials: expect.any(Array),
        footerTagline: expect.any(String),
        footerBlurb: expect.any(String),
        logoUrl: expect.any(String),
        logoDarkUrl: expect.any(String),
      });
    });

    it('reflects an admin update immediately', async () => {
      const { token } = await seedAdminSession(app, ['content.manage']);

      await request(app.getHttpServer())
        .patch('/v1/admin/site-settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ contactEmail: 'hello@example.com' })
        .expect(200);

      const response = await request(app.getHttpServer()).get('/v1/site-settings').expect(200);
      expect(response.body.contactEmail).toBe('hello@example.com');
    });
  });

  describe('admin authoring', () => {
    it('refuses to view without content.view', async () => {
      const { token } = await seedAdminSession(app, []);

      await request(app.getHttpServer())
        .get('/v1/admin/site-settings')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('refuses to update without content.manage', async () => {
      const { token } = await seedAdminSession(app, ['content.view']);

      await request(app.getHttpServer())
        .patch('/v1/admin/site-settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ contactEmail: 'nope@example.com' })
        .expect(403);
    });

    it('merges a partial update rather than replacing the whole row', async () => {
      const { token } = await seedAdminSession(app, ['content.manage', 'content.view']);

      const before = await request(app.getHttpServer())
        .get('/v1/admin/site-settings')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch('/v1/admin/site-settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ footerTagline: 'A new tagline.' })
        .expect(200);

      const after = await request(app.getHttpServer())
        .get('/v1/admin/site-settings')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(after.body.footerTagline).toBe('A new tagline.');
      expect(after.body.contactEmail).toBe(before.body.contactEmail);
      expect(after.body.socials).toEqual(before.body.socials);
    });

    it('replaces the socials array wholesale when given one', async () => {
      const { token } = await seedAdminSession(app, ['content.manage', 'content.view']);

      await request(app.getHttpServer())
        .patch('/v1/admin/site-settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ socials: [{ label: 'Instagram', href: 'https://instagram.com/rakuxon' }] })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/v1/admin/site-settings')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.socials).toEqual([
        { label: 'Instagram', href: 'https://instagram.com/rakuxon' },
      ]);
    });
  });
});
