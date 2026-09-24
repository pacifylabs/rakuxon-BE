import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { createTestApp } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';

describe('admin: media assets', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const create = (token: string, overrides: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/v1/admin/media-assets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Instagram launch pack',
        category: 'social_toolkit',
        fileUrl: 'https://res.cloudinary.com/demo/raw/upload/v1/pack.zip',
        cloudinaryPublicId: `rakuxon/admin-content/media-assets/${Math.random().toString(36).slice(2, 10)}`,
        ...overrides,
      });

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await dataSource.query('TRUNCATE TABLE "media_assets" CASCADE');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('creates an asset, attributed to the uploading admin', async () => {
    const { token } = await seedAdminSession(app, ['media.manage']);

    const response = await create(token).expect(201);

    expect(response.body).toMatchObject({
      title: 'Instagram launch pack',
      category: 'social_toolkit',
      fileUrl: 'https://res.cloudinary.com/demo/raw/upload/v1/pack.zip',
      uploadedByAdminName: 'Test Admin',
    });
  });

  it('refuses to create without media.manage', async () => {
    const { token } = await seedAdminSession(app, ['media.view']);
    await create(token).expect(403);
  });

  it('refuses to list without media.view', async () => {
    const { token } = await seedAdminSession(app, []);
    await request(app.getHttpServer())
      .get('/v1/admin/media-assets')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('lists, filters by category, and searches by title', async () => {
    const { token } = await seedAdminSession(app, ['media.manage', 'media.view']);

    await create(token, { title: 'Brand guidelines', category: 'brand_asset' }).expect(201);
    await create(token, { title: 'Instagram story template', category: 'social_toolkit' }).expect(201);

    const byCategory = await request(app.getHttpServer())
      .get('/v1/admin/media-assets?category=brand_asset')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(byCategory.body.items).toMatchObject([{ title: 'Brand guidelines' }]);

    const bySearch = await request(app.getHttpServer())
      .get('/v1/admin/media-assets?q=instagram')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(bySearch.body.items).toMatchObject([{ title: 'Instagram story template' }]);
  });

  it('updates title, description and category', async () => {
    const { token } = await seedAdminSession(app, ['media.manage']);
    const created = await create(token).expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/v1/admin/media-assets/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated title', description: 'A short note', category: 'design' })
      .expect(200);

    expect(updated.body).toMatchObject({
      title: 'Updated title',
      description: 'A short note',
      category: 'design',
    });
  });

  it('deletes an asset', async () => {
    const { token } = await seedAdminSession(app, ['media.manage', 'media.view']);
    const created = await create(token).expect(201);

    await request(app.getHttpServer())
      .delete(`/v1/admin/media-assets/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/v1/admin/media-assets/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('404s for an unknown asset id', async () => {
    const { token } = await seedAdminSession(app, ['media.view']);
    await request(app.getHttpServer())
      .get('/v1/admin/media-assets/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('refuses an unauthenticated caller', async () => {
    await request(app.getHttpServer()).get('/v1/admin/media-assets').expect(401);
  });
});
