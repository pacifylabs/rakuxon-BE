import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { createTestApp } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';

describe('admin: attendance', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await dataSource.query('TRUNCATE TABLE "attendance_records" CASCADE');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('clocks in and clocks out for the day', async () => {
    const { token } = await seedAdminSession(app, []);

    const before = await request(app.getHttpServer())
      .get('/v1/admin/attendance/me/today')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(before.body.record).toBeNull();

    const clockIn = await request(app.getHttpServer())
      .post('/v1/admin/attendance/me/clock-in')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(clockIn.body).toMatchObject({ adminName: 'Test Admin', clockOutAt: null });
    expect(clockIn.body.clockInAt).toEqual(expect.any(String));

    const clockOut = await request(app.getHttpServer())
      .post('/v1/admin/attendance/me/clock-out')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(clockOut.body.id).toBe(clockIn.body.id);
    expect(clockOut.body.clockOutAt).toEqual(expect.any(String));

    const after = await request(app.getHttpServer())
      .get('/v1/admin/attendance/me/today')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.record.id).toBe(clockIn.body.id);
  });

  it('refuses a second clock-in the same day', async () => {
    const { token } = await seedAdminSession(app, []);
    await request(app.getHttpServer())
      .post('/v1/admin/attendance/me/clock-in')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/admin/attendance/me/clock-in')
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });

  it('refuses to clock out before clocking in', async () => {
    const { token } = await seedAdminSession(app, []);
    await request(app.getHttpServer())
      .post('/v1/admin/attendance/me/clock-out')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('refuses a second clock-out the same day', async () => {
    const { token } = await seedAdminSession(app, []);
    await request(app.getHttpServer())
      .post('/v1/admin/attendance/me/clock-in')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    await request(app.getHttpServer())
      .post('/v1/admin/attendance/me/clock-out')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/admin/attendance/me/clock-out')
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });

  it("lets an admin see their own history without attendance.view", async () => {
    const { token } = await seedAdminSession(app, []);
    await request(app.getHttpServer())
      .post('/v1/admin/attendance/me/clock-in')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const mine = await request(app.getHttpServer())
      .get('/v1/admin/attendance/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(mine.body.items).toHaveLength(1);
  });

  it('refuses the team log without attendance.view', async () => {
    const { token } = await seedAdminSession(app, []);
    await request(app.getHttpServer())
      .get('/v1/admin/attendance')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it("shows every admin's clock-ins on the team log, filterable by admin", async () => {
    const a = await seedAdminSession(app, []);
    const b = await seedAdminSession(app, []);
    const viewer = await seedAdminSession(app, ['attendance.view']);

    await request(app.getHttpServer())
      .post('/v1/admin/attendance/me/clock-in')
      .set('Authorization', `Bearer ${a.token}`)
      .expect(201);
    await request(app.getHttpServer())
      .post('/v1/admin/attendance/me/clock-in')
      .set('Authorization', `Bearer ${b.token}`)
      .expect(201);

    const all = await request(app.getHttpServer())
      .get('/v1/admin/attendance')
      .set('Authorization', `Bearer ${viewer.token}`)
      .expect(200);
    expect(all.body.total).toBe(2);

    const filtered = await request(app.getHttpServer())
      .get(`/v1/admin/attendance?adminId=${a.adminId}`)
      .set('Authorization', `Bearer ${viewer.token}`)
      .expect(200);
    expect(filtered.body.items).toMatchObject([{ adminId: a.adminId }]);
  });
});
