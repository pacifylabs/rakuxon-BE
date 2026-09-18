import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import type { AdminSummaryDto, CreateAdminDto, PermissionDto } from './dto/admin.dto';
import type { AdminRoleSummaryDto, SaveAdminRoleDto } from './dto/admin-role.dto';
import { Admin } from './entities/admin.entity';
import { AdminPermission } from './entities/admin-permission.entity';
import { AdminRole } from './entities/admin-role.entity';
import { AdminRolePermission } from './entities/admin-role-permission.entity';
import { Permission } from './entities/permission.entity';
import { adminPermissionKeys } from './admin-access';
import { UserStatus } from '../../contract/enums';
import { PasswordService } from '../auth/password.service';

@Injectable()
export class AdminsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly passwords: PasswordService,
  ) {}

  async listPermissionsCatalog(): Promise<PermissionDto[]> {
    return this.dataSource.getRepository(Permission).find({ order: { key: 'ASC' } });
  }

  async create(dto: CreateAdminDto): Promise<AdminSummaryDto> {
    if ((dto.roleId === undefined) === (dto.permissionKeys === undefined)) {
      throw new BadRequestException(
        'Choose one role. Do not combine a role with individual permissions.',
      );
    }
    if (dto.roleId === null || dto.permissionKeys === null) {
      throw new BadRequestException('A role or legacy permission list cannot be null.');
    }
    const passwordHash = await this.passwords.hash(dto.password);
    return this.mutate(async (m) => {
      if (await m.existsBy(Admin, { email: dto.email }))
        throw new ConflictException('That email is already registered as an admin.');
      if (dto.roleId) await this.getRole(m, dto.roleId);
      const permissions = await this.resolvePermissions(m, dto.permissionKeys ?? []);
      const admin = await m.save(
        Admin,
        m.create(Admin, {
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          passwordHash,
          status: UserStatus.Active,
          roleId: dto.roleId ?? null,
        }),
      );
      if (permissions.length)
        await m.insert(
          AdminPermission,
          permissions.map((p) => ({ adminId: admin.id, permissionId: p.id })),
        );
      return this.summary(m, admin);
    });
  }

  async list(): Promise<AdminSummaryDto[]> {
    const m = this.dataSource.manager;
    return Promise.all(
      (await m.find(Admin, { order: { createdAt: 'ASC' } })).map((a) => this.summary(m, a)),
    );
  }

  async updatePermissions(id: string, permissionKeys: string[]): Promise<AdminSummaryDto> {
    return this.mutate(async (m) => {
      const admin = await this.getAdmin(m, id);
      if (admin.roleId)
        throw new ConflictException(
          'This admin uses a role. Edit that role or assign another role.',
        );
      const permissions = await this.resolvePermissions(m, permissionKeys);
      await m.delete(AdminPermission, { adminId: id });
      if (permissions.length)
        await m.insert(
          AdminPermission,
          permissions.map((p) => ({ adminId: id, permissionId: p.id })),
        );
      return this.summary(m, admin);
    });
  }

  async assignRole(id: string, roleId: string): Promise<AdminSummaryDto> {
    return this.mutate(async (m) => {
      const admin = await this.getAdmin(m, id);
      await this.getRole(m, roleId);
      admin.roleId = roleId;
      await m.save(admin);
      await m.delete(AdminPermission, { adminId: id });
      return this.summary(m, admin);
    });
  }

  async listRoles(): Promise<AdminRoleSummaryDto[]> {
    const m = this.dataSource.manager;
    return Promise.all(
      (await m.find(AdminRole, { order: { name: 'ASC' } })).map((r) => this.roleSummary(m, r)),
    );
  }

  async saveRole(dto: SaveAdminRoleDto, id?: string): Promise<AdminRoleSummaryDto> {
    return this.mutate(async (m) => {
      const role = id ? await this.getRole(m, id) : m.create(AdminRole);
      const duplicate = await m.findOneBy(AdminRole, { name: dto.name });
      if (duplicate && duplicate.id !== id)
        throw new ConflictException('A role with that name already exists.');
      const permissions = await this.resolvePermissions(m, dto.permissionKeys);
      role.name = dto.name;
      role.description = dto.description;
      const saved = await m.save(role);
      await m.delete(AdminRolePermission, { roleId: saved.id });
      if (permissions.length)
        await m.insert(
          AdminRolePermission,
          permissions.map((p) => ({ roleId: saved.id, permissionId: p.id })),
        );
      return this.roleSummary(m, saved);
    });
  }

  async deleteRole(id: string): Promise<void> {
    return this.mutate(async (m) => {
      await this.getRole(m, id);
      if (await m.existsBy(Admin, { roleId: id }))
        throw new ConflictException('Reassign every admin using this role before deleting it.');
      await m.delete(AdminRole, id);
    });
  }

  suspend(id: string): Promise<AdminSummaryDto> {
    return this.setStatus(id, UserStatus.Suspended);
  }
  reactivate(id: string): Promise<AdminSummaryDto> {
    return this.setStatus(id, UserStatus.Active);
  }

  private async setStatus(id: string, status: UserStatus): Promise<AdminSummaryDto> {
    return this.mutate(async (m) => {
      const admin = await this.getAdmin(m, id);
      admin.status = status;
      await m.save(admin);
      return this.summary(m, admin);
    });
  }

  /** Serialize access changes so concurrent edits cannot remove the final manager. */
  private async mutate<T>(work: (m: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(1757003300)');
      const hadManager = await this.hasManager(m);
      const result = await work(m);
      if (hadManager && !(await this.hasManager(m)))
        throw new ConflictException(
          'Keep at least one active admin with the admins.manage permission.',
        );
      return result;
    });
  }

  private async hasManager(m: EntityManager): Promise<boolean> {
    const admins = await m.findBy(Admin, { status: UserStatus.Active });
    for (const admin of admins)
      if ((await adminPermissionKeys(m, admin.id)).includes('admins.manage')) return true;
    return false;
  }

  private async resolvePermissions(m: EntityManager, keys: string[]): Promise<Permission[]> {
    const rows = keys.length ? await m.findBy(Permission, { key: In(keys) }) : [];
    const found = new Set(rows.map((p) => p.key));
    if (keys.some((k) => !found.has(k))) throw new BadRequestException('Unknown permission key.');
    return rows;
  }

  private async getAdmin(m: EntityManager, id: string): Promise<Admin> {
    const admin = await m.findOneBy(Admin, { id });
    if (!admin) throw new NotFoundException('No admin with that id.');
    return admin;
  }

  private async getRole(m: EntityManager, id: string): Promise<AdminRole> {
    const role = await m.findOneBy(AdminRole, { id });
    if (!role) throw new NotFoundException('No role with that id.');
    return role;
  }

  private async roleSummary(m: EntityManager, role: AdminRole): Promise<AdminRoleSummaryDto> {
    const permissions: { key: string }[] = await m.query(
      'SELECT p.key FROM permissions p JOIN admin_role_permissions rp ON rp."permissionId" = p.id WHERE rp."roleId" = $1 ORDER BY p.key',
      [role.id],
    );
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: permissions.map((p) => p.key),
      adminCount: await m.countBy(Admin, { roleId: role.id }),
    };
  }

  private async summary(m: EntityManager, admin: Admin): Promise<AdminSummaryDto> {
    return {
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      status: admin.status,
      permissions: await adminPermissionKeys(m, admin.id),
      role: admin.roleId ? await this.roleSummary(m, await this.getRole(m, admin.roleId)) : null,
      createdAt: admin.createdAt.toISOString(),
    };
  }
}
