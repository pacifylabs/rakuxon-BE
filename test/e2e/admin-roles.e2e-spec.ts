import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { writeFileSync } from 'node:fs';
import { setupSwagger } from '../../src/swagger';
import { createTestApp, truncateIdentity } from '../helpers/create-test-app';
import { seedAdminSession } from '../helpers/seed-admin';

describe('reusable admin roles', () => {
  let app: INestApplication;
  let manager: string;
  beforeAll(async () => {
    ({ app } = await createTestApp());
  });
  beforeEach(async () => {
    await truncateIdentity(app);
    manager = (await seedAdminSession(app, ['admins.manage'])).token;
  });
  afterAll(async () => {
    await truncateIdentity(app);
    await app?.close();
  });
  const api = (token = manager) => ({
    get: (path: string) =>
      request(app.getHttpServer())
        .get(`/v1/admin/admins${path}`)
        .set('Authorization', `Bearer ${token}`),
    post: (path: string) =>
      request(app.getHttpServer())
        .post(`/v1/admin/admins${path}`)
        .set('Authorization', `Bearer ${token}`),
    patch: (path: string) =>
      request(app.getHttpServer())
        .patch(`/v1/admin/admins${path}`)
        .set('Authorization', `Bearer ${token}`),
    delete: (path: string) =>
      request(app.getHttpServer())
        .delete(`/v1/admin/admins${path}`)
        .set('Authorization', `Bearer ${token}`),
  });
  const roleBody = {
    name: 'Customer Support',
    description: 'Student support team',
    permissionKeys: ['tenants.view'],
    isSuccessManagerPool: false,
  };
  const createRole = async () => (await api().post('/roles').send(roleBody).expect(201)).body;

  it('assigns one role to several admins and updates permissions for existing sessions immediately', async () => {
    const role = await createRole();
    const sessions: string[] = [];
    for (const n of [1, 2]) {
      const email = `support${n}@example.com`;
      const created = await api()
        .post('')
        .send({
          email,
          firstName: 'Support',
          lastName: String(n),
          password: 'correct-horse-battery',
          roleId: role.id,
        })
        .expect(201);
      expect(created.body.role.name).toBe('Customer Support');
      expect(created.body.permissions).toEqual(['tenants.view']);
      const login = await request(app.getHttpServer())
        .post('/v1/admin-auth/login')
        .send({ email, password: 'correct-horse-battery' })
        .expect(200);
      expect(login.body.admin.permissions).toEqual(['tenants.view']);
      sessions.push(login.body.accessToken);
    }
    expect((await api().get('/roles').expect(200)).body[0].adminCount).toBe(2);
    await api()
      .patch(`/roles/${role.id}`)
      .send({ ...roleBody, permissionKeys: ['catalogue.view'] })
      .expect(200);
    for (const token of sessions) {
      await request(app.getHttpServer())
        .get('/v1/admin/tenants')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/v1/admin/catalogue/institutions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    }
  });

  it('role assignment replaces legacy permissions and rejects individual overrides', async () => {
    const role = await createRole();
    const target = await seedAdminSession(app, ['catalogue.view']);
    const updated = await api()
      .patch(`/${target.adminId}/role`)
      .send({ roleId: role.id })
      .expect(200);
    expect(updated.body.permissions).toEqual(['tenants.view']);
    await api()
      .patch(`/${target.adminId}/permissions`)
      .send({ permissionKeys: ['admins.manage'] })
      .expect(409);
    await api().delete(`/roles/${role.id}`).expect(409);
    const empty = (
      await api()
        .post('/roles')
        .send({ name: 'No access', description: '', permissionKeys: [], isSuccessManagerPool: false })
        .expect(201)
    ).body;
    await api().patch(`/${target.adminId}/role`).send({ roleId: empty.id }).expect(200);
    await api().delete(`/roles/${role.id}`).expect(204);
    await api().patch(`/${target.adminId}/role`).send({ roleId: role.id }).expect(404);
  });

  it('validates role names, permission keys and ambiguous assignment', async () => {
    const role = await createRole();
    await api()
      .post('/roles')
      .send({ ...roleBody, name: ' customer support ' })
      .expect(409);
    await api()
      .post('/roles')
      .send({ ...roleBody, name: '  ' })
      .expect(400);
    await api()
      .patch(`/roles/${role.id}`)
      .send({ ...roleBody, permissionKeys: ['made.up'] })
      .expect(400);
    expect((await api().get('/roles')).body[0].permissions).toEqual(['tenants.view']);
    const body = {
      email: 'a@example.com',
      firstName: 'A',
      lastName: 'B',
      password: 'correct-horse-battery',
    };
    await api().post('').send(body).expect(400);
    await api()
      .post('')
      .send({ ...body, roleId: role.id, permissionKeys: [] })
      .expect(400);
  });

  it('requires management permission for all role operations', async () => {
    const role = await createRole();
    const { token, adminId } = await seedAdminSession(app, ['tenants.view']);
    await api(token).get('/roles').expect(403);
    await api(token)
      .post('/roles')
      .send({ ...roleBody, name: 'Other' })
      .expect(403);
    await api(token).patch(`/roles/${role.id}`).send(roleBody).expect(403);
    await api(token).delete(`/roles/${role.id}`).expect(403);
    await api(token).patch(`/${adminId}/role`).send({ roleId: role.id }).expect(403);
  });

  it('prevents suspension, reassignment or role changes that remove the last manager', async () => {
    const rows = (await api().get('')).body.items;
    const id = rows[0].id;
    const role = (
      await api()
        .post('/roles')
        .send({ ...roleBody, permissionKeys: ['admins.manage'] })
        .expect(201)
    ).body;
    await api().patch(`/${id}/role`).send({ roleId: role.id }).expect(200);
    await api()
      .patch(`/roles/${role.id}`)
      .send({ ...roleBody, permissionKeys: [] })
      .expect(409);
    await api().post(`/${id}/suspend`).expect(409);
    const other = (
      await api()
        .post('/roles')
        .send({ name: 'Viewer', description: '', permissionKeys: [], isSuccessManagerPool: false })
        .expect(201)
    ).body;
    await api().patch(`/${id}/role`).send({ roleId: other.id }).expect(409);
    expect(
      (await api().get('/roles')).body.find((r: { id: string }) => r.id === role.id).permissions,
    ).toEqual(['admins.manage']);
  });

  it('preserves existing permissions when migrating to roles and back', async () => {
    const { adminDataSource } = await import('../helpers/admin-data-source');
    const { AdminRoles1757003300000 } = await import('../../src/database/migrations/1757003300000-AdminRoles');
    const runner = (await adminDataSource()).createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(`CREATE SCHEMA role_migration_test;
        SET LOCAL search_path TO role_migration_test, public;
        CREATE TABLE admins (id uuid PRIMARY KEY DEFAULT uuid_generate_v4());
        CREATE TABLE permissions (id uuid PRIMARY KEY DEFAULT uuid_generate_v4());
        CREATE TABLE admin_permissions ("adminId" uuid, "permissionId" uuid);
        INSERT INTO admins SELECT uuid_generate_v4() FROM generate_series(1,4);
        INSERT INTO permissions SELECT uuid_generate_v4() FROM generate_series(1,2);
        INSERT INTO admin_permissions SELECT a.id, p.id FROM
          (SELECT id FROM admins ORDER BY id LIMIT 2) a CROSS JOIN (SELECT id FROM permissions ORDER BY id LIMIT 1) p;
        INSERT INTO admin_permissions SELECT a.id, p.id FROM
          (SELECT id FROM admins ORDER BY id DESC LIMIT 1) a CROSS JOIN permissions p;
      `);
      const before = await runner.query('SELECT * FROM admin_permissions ORDER BY "adminId", "permissionId"');
      const migration = new AdminRoles1757003300000();
      await migration.up(runner);
      const after = await runner.query('SELECT a.id AS "adminId", rp."permissionId" FROM admins a JOIN admin_role_permissions rp ON rp."roleId" = a."roleId" ORDER BY a.id, rp."permissionId"');
      expect(after).toEqual(before);
      expect((await runner.query('SELECT * FROM admin_roles')).length).toBe(3);
      expect((await runner.query('SELECT * FROM admins WHERE "roleId" IS NULL')).length).toBe(0);
      await migration.down(runner);
      expect(await runner.query('SELECT * FROM admin_permissions ORDER BY "adminId", "permissionId"')).toEqual(before);
    } finally { await runner.rollbackTransaction(); await runner.release(); }
  });

  it('logs admin changes without submitted credentials and gates platform audit access', async () => {
    const auditor = await seedAdminSession(app, ['platform.audit']);
    const role = await createRole();
    const password = 'never-put-this-in-audit-logs';
    await api().post('').send({ email: 'audited@example.com', firstName: 'Audit', lastName: 'Test', password, roleId: role.id }).expect(201);
    await request(app.getHttpServer()).get('/v1/admin/audit-log').set('Authorization', `Bearer ${manager}`).expect(403);
    const log = await request(app.getHttpServer()).get('/v1/admin/audit-log').set('Authorization', `Bearer ${auditor.token}`).expect(200);
    expect(log.body.items).toHaveLength(2);
    expect(log.body.items.every((entry: { actorType: string; action: string }) => entry.actorType === 'admin' && entry.action === 'admins.manage')).toBe(true);
    expect(JSON.stringify(log.body)).not.toContain(password);
    await api().post('/roles').send({ ...roleBody, permissionKeys: ['invalid'] }).expect(409);
    const after = await request(app.getHttpServer()).get('/v1/admin/audit-log').set('Authorization', `Bearer ${auditor.token}`).expect(200);
    expect(after.body.total).toBe(2);
  });

  it('exports the updated OpenAPI document when requested', async () => {
    const document = setupSwagger(app);
    expect(document.components?.schemas?.AdminRoleSummaryDto).toBeDefined();
    if (process.env.EXPORT_OPENAPI_PATH)
      writeFileSync(process.env.EXPORT_OPENAPI_PATH, JSON.stringify(document));
  });
});
