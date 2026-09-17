import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { createTestApp } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';

describe('testimonials', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);
    await dataSource.query('TRUNCATE TABLE "testimonials" CASCADE');
  });

  afterEach(async () => {
    await dataSource.query('TRUNCATE TABLE "testimonials" CASCADE');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('admin authoring', () => {
    it('creates a draft testimonial', async () => {
      const { token } = await seedAdminSession(app, ['content.manage']);

      const response = await request(app.getHttpServer())
        .post('/v1/admin/testimonials')
        .set('Authorization', `Bearer ${token}`)
        .send({ quote: 'Rakuxon made it happen.', authorName: 'Amara', detail: 'Nigeria → Canada' })
        .expect(201);

      expect(response.body).toMatchObject({
        quote: 'Rakuxon made it happen.',
        authorName: 'Amara',
        detail: 'Nigeria → Canada',
        status: 'draft',
        consentGiven: false,
        photoUrl: null,
      });
    });

    it('refuses to create without content.manage', async () => {
      const { token } = await seedAdminSession(app, ['content.view']);

      await request(app.getHttpServer())
        .post('/v1/admin/testimonials')
        .set('Authorization', `Bearer ${token}`)
        .send({ quote: 'Q', authorName: 'A', detail: 'D' })
        .expect(403);
    });

    it('rejects a photo without consent, on create', async () => {
      const { token } = await seedAdminSession(app, ['content.manage']);

      await request(app.getHttpServer())
        .post('/v1/admin/testimonials')
        .set('Authorization', `Bearer ${token}`)
        .send({
          quote: 'Q',
          authorName: 'A',
          detail: 'D',
          photoUrl: 'https://example.com/photo.jpg',
        })
        .expect(400);
    });

    it('accepts a photo when consent is given in the same request', async () => {
      const { token } = await seedAdminSession(app, ['content.manage']);

      const response = await request(app.getHttpServer())
        .post('/v1/admin/testimonials')
        .set('Authorization', `Bearer ${token}`)
        .send({
          quote: 'Q',
          authorName: 'A',
          detail: 'D',
          photoUrl: 'https://example.com/photo.jpg',
          consentGiven: true,
        })
        .expect(201);

      expect(response.body.photoUrl).toBe('https://example.com/photo.jpg');
    });

    it('rejects a PATCH that would add a photo without existing or new consent', async () => {
      const { token } = await seedAdminSession(app, ['content.manage']);

      const created = await request(app.getHttpServer())
        .post('/v1/admin/testimonials')
        .set('Authorization', `Bearer ${token}`)
        .send({ quote: 'Q', authorName: 'A', detail: 'D' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/v1/admin/testimonials/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ photoUrl: 'https://example.com/photo.jpg' })
        .expect(400);
    });

    it('publishes and then lists a testimonial as published', async () => {
      const { token } = await seedAdminSession(app, ['content.manage', 'content.view']);

      const created = await request(app.getHttpServer())
        .post('/v1/admin/testimonials')
        .set('Authorization', `Bearer ${token}`)
        .send({ quote: 'Q', authorName: 'A', detail: 'D', placement: ['home'] })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v1/admin/testimonials/${created.body.id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const list = await request(app.getHttpServer())
        .get('/v1/admin/testimonials?status=published')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(list.body.items).toMatchObject([{ id: created.body.id, status: 'published' }]);
    });

    it('404s for an unknown testimonial id', async () => {
      const { token } = await seedAdminSession(app, ['content.view']);
      const missingId = '00000000-0000-0000-0000-000000000000';

      await request(app.getHttpServer())
        .get(`/v1/admin/testimonials/${missingId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('public read', () => {
    it('only returns published testimonials, filtered by placement', async () => {
      const { token } = await seedAdminSession(app, ['content.manage']);

      const home = await request(app.getHttpServer())
        .post('/v1/admin/testimonials')
        .set('Authorization', `Bearer ${token}`)
        .send({ quote: 'Home quote', authorName: 'A', detail: 'D', placement: ['home'] })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/v1/admin/testimonials/${home.body.id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const students = await request(app.getHttpServer())
        .post('/v1/admin/testimonials')
        .set('Authorization', `Bearer ${token}`)
        .send({ quote: 'Students quote', authorName: 'B', detail: 'D', placement: ['students'] })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/v1/admin/testimonials/${students.body.id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const draft = await request(app.getHttpServer())
        .post('/v1/admin/testimonials')
        .set('Authorization', `Bearer ${token}`)
        .send({ quote: 'Draft quote', authorName: 'C', detail: 'D', placement: ['home'] })
        .expect(201);
      void draft;

      const response = await request(app.getHttpServer())
        .get('/v1/testimonials?placement=home')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({ quote: 'Home quote', authorName: 'A' });
    });

    it('does not require authentication', async () => {
      await request(app.getHttpServer()).get('/v1/testimonials').expect(200);
    });
  });
});
