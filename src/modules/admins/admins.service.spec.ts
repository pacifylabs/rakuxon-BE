import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AdminsService } from './admins.service';
import { Admin } from './entities/admin.entity';
import { AdminPermission } from './entities/admin-permission.entity';
import { Permission } from './entities/permission.entity';
import { UserStatus } from '../../contract/enums';
import { PasswordService } from '../auth/password.service';

describe('AdminsService', () => {
  let service: AdminsService;
  const admin = {
    id: 'a-1',
    email: 'x@example.com',
    firstName: 'A',
    lastName: 'B',
    status: UserStatus.Active,
    roleId: null,
    createdAt: new Date(),
  };
  let granted: { key: string }[];
  const m = {
    existsBy: jest.fn(),
    findBy: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn((_entity, value) => value),
    save: jest.fn((_entity, value) => ({ ...admin, ...value })),
    insert: jest.fn(),
    delete: jest.fn(),
    query: jest.fn(),
  };
  const body = {
    email: 'new@example.com',
    firstName: 'A',
    lastName: 'B',
    password: 'correct-horse-battery',
    permissionKeys: ['tenants.view'],
  };
  beforeEach(() => {
    jest.clearAllMocks();
    granted = [];
    m.existsBy.mockResolvedValue(false);
    m.findBy.mockImplementation(async (entity) =>
      entity === Admin ? [] : [{ id: 'p-1', key: 'tenants.view' }],
    );
    m.findOneBy.mockResolvedValue(admin);
    m.query.mockImplementation(async (sql) => (sql.includes('pg_advisory') ? [] : granted));
    m.insert.mockImplementation(async () => {
      granted = [{ key: 'tenants.view' }];
    });
    m.delete.mockImplementation(async () => {
      granted = [];
    });
    const db = {
      transaction: (fn: (manager: EntityManager) => unknown) => fn(m as unknown as EntityManager),
    };
    service = new AdminsService(db as DataSource, new PasswordService());
  });
  it('rejects a duplicate email before resolving permissions', async () => {
    m.existsBy.mockResolvedValue(true);
    await expect(service.create(body)).rejects.toThrow(ConflictException);
    expect(m.findBy).not.toHaveBeenCalledWith(Permission, expect.anything());
  });
  it('rejects an unknown permission key without creating the admin', async () => {
    m.findBy.mockResolvedValue([]);
    await expect(service.create(body)).rejects.toThrow(BadRequestException);
    expect(m.save).not.toHaveBeenCalled();
  });
  it('creates the admin with exactly the resolved permissions', async () => {
    const result = await service.create(body);
    expect(result.permissions).toEqual(['tenants.view']);
    expect(result.status).toBe(UserStatus.Active);
    expect(m.insert).toHaveBeenCalledWith(AdminPermission, [
      { adminId: 'a-1', permissionId: 'p-1' },
    ]);
  });
  it('replaces direct grants instead of adding to them', async () => {
    granted = [{ key: 'catalogue.view' }];
    const result = await service.updatePermissions('a-1', ['tenants.view']);
    expect(m.delete).toHaveBeenCalledWith(AdminPermission, { adminId: 'a-1' });
    expect(m.delete.mock.invocationCallOrder[0]).toBeLessThan(
      m.insert.mock.invocationCallOrder[0]!,
    );
    expect(result.permissions).toEqual(['tenants.view']);
  });
  it('clears all direct grants when given an empty list', async () => {
    granted = [{ key: 'catalogue.view' }];
    const result = await service.updatePermissions('a-1', []);
    expect(m.delete).toHaveBeenCalledWith(AdminPermission, { adminId: 'a-1' });
    expect(m.insert).not.toHaveBeenCalled();
    expect(result.permissions).toEqual([]);
  });
});
