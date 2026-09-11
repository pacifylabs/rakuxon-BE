import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';

import { AdminsService } from './admins.service';
import { Admin } from './entities/admin.entity';
import { AdminPermission } from './entities/admin-permission.entity';
import { Permission } from './entities/permission.entity';
import { UserStatus } from '../../contract/enums';
import { PasswordService } from '../auth/password.service';

/**
 * Covers permission-key resolution and the replace-set semantics of
 * updatePermissions directly. `list()`'s query-builder join is exercised by
 * the e2e suite instead, against a real database.
 */
describe('AdminsService', () => {
  const admins = {
    exist: jest.fn(),
    save: jest.fn((entity: unknown) => ({ id: 'a-1', createdAt: new Date('2026-01-01'), ...(entity as object) })),
    create: jest.fn((entity: unknown) => entity),
    findOne: jest.fn(),
  };

  const adminPermissions = {
    save: jest.fn(),
    create: jest.fn((entity: unknown) => entity),
    delete: jest.fn(),
  };

  const permissions = {
    find: jest.fn(),
  };

  let service: AdminsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminsService,
        { provide: getRepositoryToken(Admin), useValue: admins },
        { provide: getRepositoryToken(AdminPermission), useValue: adminPermissions },
        { provide: getRepositoryToken(Permission), useValue: permissions },
        PasswordService,
      ],
    }).compile();

    service = moduleRef.get(AdminsService);
  });

  describe('create', () => {
    it('rejects a duplicate email before touching permissions', async () => {
      admins.exist.mockResolvedValue(true);

      await expect(
        service.create({
          email: 'dup@example.com',
          firstName: 'A',
          lastName: 'B',
          password: 'correct-horse-battery',
          permissionKeys: [],
        }),
      ).rejects.toThrow(ConflictException);

      expect(permissions.find).not.toHaveBeenCalled();
    });

    it('rejects an unknown permission key and never creates the admin', async () => {
      admins.exist.mockResolvedValue(false);
      permissions.find.mockResolvedValue([]);

      await expect(
        service.create({
          email: 'new@example.com',
          firstName: 'A',
          lastName: 'B',
          password: 'correct-horse-battery',
          permissionKeys: ['not-a-real-permission'],
        }),
      ).rejects.toThrow(BadRequestException);

      expect(admins.save).not.toHaveBeenCalled();
    });

    it('creates the admin and grants exactly the resolved permissions', async () => {
      admins.exist.mockResolvedValue(false);
      permissions.find.mockResolvedValue([{ id: 'p-1', key: 'tenants.view' }]);

      const result = await service.create({
        email: 'new@example.com',
        firstName: 'A',
        lastName: 'B',
        password: 'correct-horse-battery',
        permissionKeys: ['tenants.view'],
      });

      expect(result.permissions).toEqual(['tenants.view']);
      expect(result.status).toBe(UserStatus.Active);
      expect(adminPermissions.save).toHaveBeenCalledWith([
        expect.objectContaining({ adminId: 'a-1', permissionId: 'p-1' }),
      ]);
    });
  });

  describe('updatePermissions', () => {
    it('deletes the existing set before inserting the new one — replace, not additive', async () => {
      admins.findOne.mockResolvedValue({ id: 'a-1', email: 'x@example.com', firstName: 'A', lastName: 'B', status: UserStatus.Active, createdAt: new Date() });
      permissions.find.mockResolvedValue([{ id: 'p-2', key: 'catalogue.view' }]);

      const result = await service.updatePermissions('a-1', ['catalogue.view']);

      expect(adminPermissions.delete).toHaveBeenCalledWith({ adminId: 'a-1' });
      expect(result.permissions).toEqual(['catalogue.view']);
    });

    it('leaves the admin with no permissions when given an empty list', async () => {
      admins.findOne.mockResolvedValue({ id: 'a-1', email: 'x@example.com', firstName: 'A', lastName: 'B', status: UserStatus.Active, createdAt: new Date() });
      permissions.find.mockResolvedValue([]);

      const result = await service.updatePermissions('a-1', []);

      expect(adminPermissions.delete).toHaveBeenCalledWith({ adminId: 'a-1' });
      expect(adminPermissions.save).not.toHaveBeenCalled();
      expect(result.permissions).toEqual([]);
    });
  });
});
