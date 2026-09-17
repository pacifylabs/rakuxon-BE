import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { createTestApp } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';

const baseService = {
  slug: 'free-consultancy',
  iconName: 'Compass',
  title: 'Free Educational Consultancy',
  summary: 'Where every journey starts, at no cost.',
  description: 'Complimentary expert guidance in choosing the right universities and courses.',
  strand: 'education',
  metaTitle: 'Free Study Abroad Consultation | Rakuxon',
  metaDescription: 'Book a free educational consultancy with Rakuxon.',
};

describe('services', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);
    await dataSource.query('TRUNCATE TABLE "services" CASCADE');
  });

  afterEach(async () => {
    await dataSource.query('TRUNCATE TABLE "services" CASCADE');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('admin authoring', () => {
    it('creates a draft service', async () => {
      const { token } = await seedAdminSession(app, ['content.manage']);

      const response = await request(app.getHttpServer())
        .post('/v1/admin/services')
        .set('Authorization', `Bearer ${token}`)
        .send(baseService)
        .expect(201);

      expect(response.body).toMatchObject({
        slug: 'free-consultancy',
        title: 'Free Educational Consultancy',
        strand: 'education',
        status: 'draft',
        whatsIncluded: [],
        faqs: [],
      });
    });

    it('refuses to create without content.manage', async () => {
      const { token } = await seedAdminSession(app, ['content.view']);

      await request(app.getHttpServer())
        .post('/v1/admin/services')
        .set('Authorization', `Bearer ${token}`)
        .send(baseService)
        .expect(403);
    });

    it('publishes and then lists a service as published', async () => {
      const { token } = await seedAdminSession(app, ['content.manage', 'content.view']);

      const created = await request(app.getHttpServer())
        .post('/v1/admin/services')
        .set('Authorization', `Bearer ${token}`)
        .send(baseService)
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v1/admin/services/${created.body.id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const list = await request(app.getHttpServer())
        .get('/v1/admin/services?status=published')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(list.body.items).toMatchObject([{ id: created.body.id, status: 'published' }]);
    });

    it('updates whatsIncluded and faqs via PATCH', async () => {
      const { token } = await seedAdminSession(app, ['content.manage']);

      const created = await request(app.getHttpServer())
        .post('/v1/admin/services')
        .set('Authorization', `Bearer ${token}`)
        .send(baseService)
        .expect(201);

      const updated = await request(app.getHttpServer())
        .patch(`/v1/admin/services/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          whatsIncluded: ['A conversation about your goals'],
          faqs: [{ question: 'Is it free?', answer: 'Yes.' }],
        })
        .expect(200);

      expect(updated.body.whatsIncluded).toEqual(['A conversation about your goals']);
      expect(updated.body.faqs).toEqual([{ question: 'Is it free?', answer: 'Yes.' }]);
    });

    it('404s for an unknown service id', async () => {
      const { token } = await seedAdminSession(app, ['content.view']);
      const missingId = '00000000-0000-0000-0000-000000000000';

      await request(app.getHttpServer())
        .get(`/v1/admin/services/${missingId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('public read', () => {
    it('only returns published services from the list', async () => {
      const { token } = await seedAdminSession(app, ['content.manage']);

      const published = await request(app.getHttpServer())
        .post('/v1/admin/services')
        .set('Authorization', `Bearer ${token}`)
        .send(baseService)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/v1/admin/services/${published.body.id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const draft = await request(app.getHttpServer())
        .post('/v1/admin/services')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...baseService, slug: 'visa-support', title: 'Visa Application Support' })
        .expect(201);
      void draft;

      const response = await request(app.getHttpServer()).get('/v1/services').expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({ slug: 'free-consultancy' });
    });

    it('does not require authentication', async () => {
      await request(app.getHttpServer()).get('/v1/services').expect(200);
    });

    it('fetches a published service by slug', async () => {
      const { token } = await seedAdminSession(app, ['content.manage']);

      const created = await request(app.getHttpServer())
        .post('/v1/admin/services')
        .set('Authorization', `Bearer ${token}`)
        .send(baseService)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/v1/admin/services/${created.body.id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/v1/services/free-consultancy')
        .expect(200);

      expect(response.body).toMatchObject({ slug: 'free-consultancy', title: 'Free Educational Consultancy' });
    });

    it('404s for a draft service by slug', async () => {
      const { token } = await seedAdminSession(app, ['content.manage']);

      await request(app.getHttpServer())
        .post('/v1/admin/services')
        .set('Authorization', `Bearer ${token}`)
        .send(baseService)
        .expect(201);

      await request(app.getHttpServer()).get('/v1/services/free-consultancy').expect(404);
    });
  });
});
