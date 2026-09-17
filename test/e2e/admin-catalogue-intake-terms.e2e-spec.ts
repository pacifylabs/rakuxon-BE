import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { createTestApp } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';

describe('admin: catalogue intake terms', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);
    await dataSource.query('TRUNCATE TABLE "intake_terms" CASCADE');
  });

  afterEach(async () => {
    await dataSource.query('TRUNCATE TABLE "intake_terms" CASCADE');
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an intake term, active by default', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.publish']);

    const response = await request(app.getHttpServer())
      .post('/v1/admin/catalogue/intake-terms')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'September 2026' })
      .expect(201);

    expect(response.body).toMatchObject({ label: 'September 2026', sortOrder: 0, active: true });
  });

  it('refuses to create without catalogue.publish', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.view']);

    await request(app.getHttpServer())
      .post('/v1/admin/catalogue/intake-terms')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'September 2026' })
      .expect(403);
  });

  it('lists every intake term including inactive ones, in sort order', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.publish', 'catalogue.view']);

    const second = await request(app.getHttpServer())
      .post('/v1/admin/catalogue/intake-terms')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'January 2027', sortOrder: 2 })
      .expect(201);
    await request(app.getHttpServer())
      .post('/v1/admin/catalogue/intake-terms')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'September 2026', sortOrder: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/v1/admin/catalogue/intake-terms/${second.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ active: false })
      .expect(200);

    const list = await request(app.getHttpServer())
      .get('/v1/admin/catalogue/intake-terms')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(list.body.map((row: { label: string }) => row.label)).toEqual([
      'September 2026',
      'January 2027',
    ]);
    expect(list.body.find((row: { label: string }) => row.label === 'January 2027').active).toBe(false);
  });

  it('only the public endpoint hides inactive terms', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.publish']);

    const created = await request(app.getHttpServer())
      .post('/v1/admin/catalogue/intake-terms')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'September 2026' })
      .expect(201);

    const beforeDeactivate = await request(app.getHttpServer())
      .get('/v1/catalogue/intake-terms')
      .expect(200);
    expect(beforeDeactivate.body).toEqual([{ id: created.body.id, label: 'September 2026' }]);

    await request(app.getHttpServer())
      .patch(`/v1/admin/catalogue/intake-terms/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ active: false })
      .expect(200);

    const afterDeactivate = await request(app.getHttpServer())
      .get('/v1/catalogue/intake-terms')
      .expect(200);
    expect(afterDeactivate.body).toEqual([]);
  });

  it('404s updating an unknown intake term id', async () => {
    const { token } = await seedAdminSession(app, ['catalogue.publish']);
    const missingId = '00000000-0000-0000-0000-000000000000';

    await request(app.getHttpServer())
      .patch(`/v1/admin/catalogue/intake-terms/${missingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ active: false })
      .expect(404);
  });

  it('does not require authentication to read the public list', async () => {
    await request(app.getHttpServer()).get('/v1/catalogue/intake-terms').expect(200);
  });
});
