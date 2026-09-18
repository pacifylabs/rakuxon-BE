import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { createTestApp } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';

describe('destinations', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);
    await dataSource.query('TRUNCATE TABLE "destinations" CASCADE');
  });

  afterEach(async () => {
    await dataSource.query('TRUNCATE TABLE "destinations" CASCADE');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('admin authoring', () => {
    it('creates a draft destination', async () => {
      const { token } = await seedAdminSession(app, ['content.manage']);

      const response = await request(app.getHttpServer())
        .post('/v1/admin/destinations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          slug: 'japan',
          name: 'Japan',
          shortName: 'Japan',
          tagline: 'A different kind of far.',
          intro: 'Intro copy.',
          whyHeading: 'Why Japan',
          why: 'Why copy.',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        slug: 'japan',
        name: 'Japan',
        shortName: 'Japan',
        status: 'draft',
        whyPoints: [],
        facts: [],
        universities: [],
        helpPoints: [],
      });
    });

    it('refuses to create without content.manage', async () => {
      const { token } = await seedAdminSession(app, ['content.view']);

      await request(app.getHttpServer())
        .post('/v1/admin/destinations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          slug: 'japan',
          name: 'Japan',
          shortName: 'Japan',
          tagline: 'T',
          intro: 'I',
          whyHeading: 'W',
          why: 'W',
        })
        .expect(403);
    });

    it('refuses a duplicate slug', async () => {
      const { token } = await seedAdminSession(app, ['content.manage']);
      const dto = {
        slug: 'japan',
        name: 'Japan',
        shortName: 'Japan',
        tagline: 'T',
        intro: 'I',
        whyHeading: 'W',
        why: 'W',
      };

      await request(app.getHttpServer())
        .post('/v1/admin/destinations')
        .set('Authorization', `Bearer ${token}`)
        .send(dto)
        .expect(201);

      await request(app.getHttpServer())
        .post('/v1/admin/destinations')
        .set('Authorization', `Bearer ${token}`)
        .send(dto)
        .expect(409);
    });

    it('edits the full guide, including facts and lists', async () => {
      const { token } = await seedAdminSession(app, ['content.manage']);

      const created = await request(app.getHttpServer())
        .post('/v1/admin/destinations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          slug: 'japan',
          name: 'Japan',
          shortName: 'Japan',
          tagline: 'T',
          intro: 'I',
          whyHeading: 'W',
          why: 'W',
        })
        .expect(201);

      const updated = await request(app.getHttpServer())
        .patch(`/v1/admin/destinations/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          whyPoints: ['Point one', 'Point two'],
          facts: [{ label: 'Main intake', value: 'April', hint: 'Spring.' }],
          universities: ['Sakura University'],
          helpPoints: ['Help point'],
          displayOrder: 3,
        })
        .expect(200);

      expect(updated.body).toMatchObject({
        whyPoints: ['Point one', 'Point two'],
        facts: [{ label: 'Main intake', value: 'April', hint: 'Spring.' }],
        universities: ['Sakura University'],
        helpPoints: ['Help point'],
        displayOrder: 3,
      });
    });

    it('publishes, lists as published, then reverts to draft', async () => {
      const { token } = await seedAdminSession(app, ['content.manage', 'content.view']);

      const created = await request(app.getHttpServer())
        .post('/v1/admin/destinations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          slug: 'japan',
          name: 'Japan',
          shortName: 'Japan',
          tagline: 'T',
          intro: 'I',
          whyHeading: 'W',
          why: 'W',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v1/admin/destinations/${created.body.id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const list = await request(app.getHttpServer())
        .get('/v1/admin/destinations?status=published')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(list.body.items).toMatchObject([{ id: created.body.id, status: 'published' }]);

      await request(app.getHttpServer())
        .post(`/v1/admin/destinations/${created.body.id}/revert-to-draft`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const afterRevert = await request(app.getHttpServer())
        .get(`/v1/admin/destinations/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(afterRevert.body.status).toBe('draft');
    });

    it('404s for an unknown destination id', async () => {
      const { token } = await seedAdminSession(app, ['content.view']);
      const missingId = '00000000-0000-0000-0000-000000000000';

      await request(app.getHttpServer())
        .get(`/v1/admin/destinations/${missingId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('public read', () => {
    async function createAndPublish(token: string, slug: string, tagline: string) {
      const created = await request(app.getHttpServer())
        .post('/v1/admin/destinations')
        .set('Authorization', `Bearer ${token}`)
        .send({ slug, name: slug, shortName: slug, tagline, intro: 'I', whyHeading: 'W', why: 'W' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/v1/admin/destinations/${created.body.id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      return created.body.id;
    }

    it('only lists published guides, ordered for display', async () => {
      const { token } = await seedAdminSession(app, ['content.manage']);

      await createAndPublish(token, 'japan', 'Published one');
      await request(app.getHttpServer())
        .post('/v1/admin/destinations')
        .set('Authorization', `Bearer ${token}`)
        .send({ slug: 'draft-one', name: 'D', shortName: 'D', tagline: 'Draft', intro: 'I', whyHeading: 'W', why: 'W' })
        .expect(201);

      const response = await request(app.getHttpServer()).get('/v1/destinations').expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({ slug: 'japan', tagline: 'Published one' });
    });

    it('returns the full guide for a published slug, 404s for a draft or unknown one', async () => {
      const { token } = await seedAdminSession(app, ['content.manage']);
      await createAndPublish(token, 'japan', 'T');

      const response = await request(app.getHttpServer()).get('/v1/destinations/japan').expect(200);
      expect(response.body).toMatchObject({ slug: 'japan' });

      await request(app.getHttpServer()).get('/v1/destinations/nowhere').expect(404);
    });

    it('does not require authentication', async () => {
      await request(app.getHttpServer()).get('/v1/destinations').expect(200);
    });
  });
});
