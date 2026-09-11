import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import type { AdminSummaryDto, CreateAdminDto, PermissionDto } from './dto/admin.dto';
import { Admin } from './entities/admin.entity';
import { AdminPermission } from './entities/admin-permission.entity';
import { Permission } from './entities/permission.entity';
import { UserStatus } from '../../contract/enums';
import { PasswordService } from '../auth/password.service';

@Injectable()
export class AdminsService {
  constructor(
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
    @InjectRepository(AdminPermission) private readonly adminPermissions: Repository<AdminPermission>,
    @InjectRepository(Permission) private readonly permissions: Repository<Permission>,
    private readonly passwords: PasswordService,
  ) {}

  async listPermissionsCatalog(): Promise<PermissionDto[]> {
    const rows = await this.permissions.find({ order: { key: 'ASC' } });
    return rows.map((row) => ({ key: row.key, description: row.description }));
  }

  async create(dto: CreateAdminDto): Promise<AdminSummaryDto> {
    if (await this.admins.exist({ where: { email: dto.email } })) {
      throw new ConflictException('That email is already registered as an admin.');
    }

    const permissionRows = await this.resolvePermissionKeys(dto.permissionKeys);
    const passwordHash = await this.passwords.hash(dto.password);

    const saved = await this.admins.save(
      this.admins.create({
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash,
        status: UserStatus.Active,
      }),
    );

    if (permissionRows.length > 0) {
      await this.adminPermissions.save(
        permissionRows.map((permission) =>
          this.adminPermissions.create({ adminId: saved.id, permissionId: permission.id }),
        ),
      );
    }

    return this.toSummary(saved, permissionRows.map((permission) => permission.key));
  }

  async list(): Promise<AdminSummaryDto[]> {
    const rows = await this.admins.find({ order: { createdAt: 'ASC' } });
    if (rows.length === 0) return [];

    const grants = await this.adminPermissions
      .createQueryBuilder('ap')
      .innerJoin(Permission, 'permission', 'permission.id = ap."permissionId"')
      .where('ap."adminId" IN (:...ids)', { ids: rows.map((row) => row.id) })
      .select(['ap."adminId" AS "adminId"', 'permission.key AS "key"'])
      .getRawMany<{ adminId: string; key: string }>();

    const keysByAdmin = new Map<string, string[]>();
    for (const grant of grants) {
      const existing = keysByAdmin.get(grant.adminId) ?? [];
      existing.push(grant.key);
      keysByAdmin.set(grant.adminId, existing);
    }

    return rows.map((row) => this.toSummary(row, keysByAdmin.get(row.id) ?? []));
  }

  async updatePermissions(id: string, permissionKeys: string[]): Promise<AdminSummaryDto> {
    const admin = await this.getOrThrow(id);
    const permissionRows = await this.resolvePermissionKeys(permissionKeys);

    /* Replace-set: simplest correct semantics for "set this admin's
       permissions to exactly this list." */
    await this.adminPermissions.delete({ adminId: id });
    if (permissionRows.length > 0) {
      await this.adminPermissions.save(
        permissionRows.map((permission) =>
          this.adminPermissions.create({ adminId: id, permissionId: permission.id }),
        ),
      );
    }

    return this.toSummary(admin, permissionRows.map((permission) => permission.key));
  }

  async suspend(id: string): Promise<AdminSummaryDto> {
    return this.setStatus(id, UserStatus.Suspended);
  }

  async reactivate(id: string): Promise<AdminSummaryDto> {
    return this.setStatus(id, UserStatus.Active);
  }

  private async setStatus(id: string, status: UserStatus): Promise<AdminSummaryDto> {
    const admin = await this.getOrThrow(id);
    admin.status = status;
    const saved = await this.admins.save(admin);
    const keys = (await this.resolveGrantedKeys(id));
    return this.toSummary(saved, keys);
  }

  private async resolveGrantedKeys(adminId: string): Promise<string[]> {
    const rows = await this.permissions
      .createQueryBuilder('permission')
      .innerJoin('admin_permissions', 'ap', 'ap."permissionId" = permission.id')
      .where('ap."adminId" = :adminId', { adminId })
      .select('permission.key', 'key')
      .getRawMany<{ key: string }>();

    return rows.map((row) => row.key);
  }

  private async resolvePermissionKeys(keys: string[]): Promise<Permission[]> {
    if (keys.length === 0) return [];

    const rows = await this.permissions.find({ where: { key: In(keys) } });
    const found = new Set(rows.map((row) => row.key));
    const unknown = keys.filter((key) => !found.has(key));

    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown permission key${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}.`);
    }

    return rows;
  }

  private async getOrThrow(id: string): Promise<Admin> {
    const admin = await this.admins.findOne({ where: { id } });
    if (!admin) throw new NotFoundException('No admin with that id.');
    return admin;
  }

  private toSummary(admin: Admin, permissions: string[]): AdminSummaryDto {
    return {
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      status: admin.status,
      permissions,
      createdAt: admin.createdAt.toISOString(),
    };
  }
}
