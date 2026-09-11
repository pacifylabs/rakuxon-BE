import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { createTestApp } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';

describe('admin: catalogue articles authoring', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);
    await dataSource.query('TRUNCATE TABLE "articles" CASCADE');
  });

  afterAll(async () => {
    await dataSource.query('TRUNCATE TABLE "articles" CASCADE');
    await app.close();
  });

  const uniqueSlug = () => `probe-article-${Math.random().toString(36).slice(2, 10)}`;

  it('creates a draft article with provenance set automatically', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.publish']);
    const slug = uniqueSlug();

    const response = await request(app.getHttpServer())
      .post('/v1/admin/catalogue/articles')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug, title: 'Probe article', body: 'Body text.' })
      .expect(201);

    expect(response.body).toMatchObject({
      slug,
      title: 'Probe article',
      body: 'Body text.',
      status: 'draft',
      source: 'Rakuxon',
      sourceUrl: null,
      tags: [],
    });
  });

  it('rejects a duplicate slug on create', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.publish']);
    const slug = uniqueSlug();

    await request(app.getHttpServer())
      .post('/v1/admin/catalogue/articles')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug, title: 'First', body: 'x' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/admin/catalogue/articles')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug, title: 'Second', body: 'y' })
      .expect(409);
  });

  it('refuses to create without catalogue.publish', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.view']);

    await request(app.getHttpServer())
      .post('/v1/admin/catalogue/articles')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: uniqueSlug(), title: 'x', body: 'y' })
      .expect(403);
  });

  it('reads the full detail shape, and updates a partial set of fields without touching the rest', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.view', 'catalogue.publish']);
    const slug = uniqueSlug();

    const created = await request(app.getHttpServer())
      .post('/v1/admin/catalogue/articles')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug, title: 'Original title', body: 'Original body', author: 'Ada' })
      .expect(201);

    const detail = await request(app.getHttpServer())
      .get(`/v1/admin/catalogue/articles/${created.body.id}/detail`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body).toMatchObject({ title: 'Original title', body: 'Original body', author: 'Ada' });

    const updated = await request(app.getHttpServer())
      .patch(`/v1/admin/catalogue/articles/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated title' })
      .expect(200);

    // Only the field the PATCH named changed — author and body survive untouched.
    expect(updated.body).toMatchObject({ title: 'Updated title', body: 'Original body', author: 'Ada' });
  });

  it('rejects a PATCH that would collide an existing slug', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.publish']);
    const slugA = uniqueSlug();
    const slugB = uniqueSlug();

    await request(app.getHttpServer())
      .post('/v1/admin/catalogue/articles')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: slugA, title: 'A', body: 'a' })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/v1/admin/catalogue/articles')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: slugB, title: 'B', body: 'b' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/v1/admin/catalogue/articles/${second.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: slugA })
      .expect(409);
  });

  it('404s for an unknown article id on detail and update', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.view', 'catalogue.publish']);
    const missingId = '00000000-0000-0000-0000-000000000099';

    await request(app.getHttpServer())
      .get(`/v1/admin/catalogue/articles/${missingId}/detail`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/v1/admin/catalogue/articles/${missingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'x' })
      .expect(404);
  });
});
