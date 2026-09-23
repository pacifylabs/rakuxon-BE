import { adminSetPassword } from '../auth/admin-set-password';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, Repository } from 'typeorm';

import type {
  AdminCreateTenantDto,
  CreateTenantStaffDto,
  ListTenantsQueryDto,
  TenantDto,
  TenantListDto,
  TenantStaffDto,
  UpdateTenantDto,
} from './dto/tenant.dto';
import { Tenant } from './entities/tenant.entity';
import { PasswordService } from '../auth/password.service';
import { AGENCY_ROLES, Role, TenantStatus, UserStatus } from '../../contract/enums';
import { User } from '../users/entities/user.entity';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly passwords: PasswordService,
  ) {}

  /**
   * An admin bringing in a partner directly — the client already has a
   * relationship with them, so there is no vetting wait: the tenant starts
   * active immediately, unlike the self-service `registerAgency` path which
   * starts `pending`. Mirrors that flow's Tenant+User transaction, but issues
   * no session.
   */
  async create(dto: AdminCreateTenantDto): Promise<TenantDto> {
    const slug = dto.slug.toLowerCase();
    const passwordHash = await this.passwords.hash(dto.password);

    const tenant = await this.dataSource.transaction(async (m) => {
      if (await m.exists(Tenant, { where: { slug } })) {
        throw new ConflictException('That subdomain is already taken.');
      }

      const savedTenant = await m.save(
        Tenant,
        m.create(Tenant, { name: dto.name, slug, status: TenantStatus.Active }),
      );

      await m.save(
        User,
        m.create(User, {
          tenantId: savedTenant.id,
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          passwordHash,
          role: Role.AgencyAdmin,
          status: UserStatus.Active,
          emailVerifiedAt: new Date(),
        }),
      );

      return savedTenant;
    });

    return this.toDto(tenant);
  }

  async update(id: string, dto: UpdateTenantDto): Promise<TenantDto> {
    const tenant = await this.getOrThrow(id);
    if (dto.slug !== undefined && dto.slug.toLowerCase() !== tenant.slug) {
      const slug = dto.slug.toLowerCase();
      if (await this.tenants.exist({ where: { slug } })) {
        throw new ConflictException('That subdomain is already taken.');
      }
      tenant.slug = slug;
    }
    if (dto.name !== undefined) tenant.name = dto.name;
    return this.toDto(await this.tenants.save(tenant));
  }

  async listStaff(tenantId: string): Promise<TenantStaffDto[]> {
    await this.getOrThrow(tenantId);
    const staff = await this.users.find({
      where: { tenantId, role: In(AGENCY_ROLES) },
      order: { createdAt: 'ASC' },
    });
    return staff.map((user) => this.staffToDto(user));
  }

  async addStaff(tenantId: string, dto: CreateTenantStaffDto): Promise<TenantStaffDto> {
    await this.getOrThrow(tenantId);
    const passwordHash = await this.passwords.hash(dto.password);

    const user = await this.dataSource.transaction(async (m) => {
      if (await m.exists(User, { where: { tenantId, email: dto.email } })) {
        throw new ConflictException('That email is already registered.');
      }
      return m.save(
        User,
        m.create(User, {
          tenantId,
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          passwordHash,
          role: dto.role ?? Role.AgencyAdmin,
          status: UserStatus.Active,
          emailVerifiedAt: new Date(),
        }),
      );
    });

    return this.staffToDto(user);
  }

  /** An admin setting a staff member's password directly — a reset done for them, not by them. */
  async setStaffPassword(tenantId: string, userId: string, password: string): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId, tenantId, role: In(AGENCY_ROLES) } });
    if (!user) throw new NotFoundException('No staff member with that id at this partner.');

    const passwordHash = await this.passwords.hash(password);
    await adminSetPassword(this.dataSource, user.id, passwordHash);
  }

  /** Suspending/reactivating a staff account — same shape as `AdminsService.suspend`/`.reactivate`, scoped to one tenant's own staff. */
  async setStaffStatus(tenantId: string, userId: string, status: UserStatus): Promise<TenantStaffDto> {
    const user = await this.users.findOne({ where: { id: userId, tenantId, role: In(AGENCY_ROLES) } });
    if (!user) throw new NotFoundException('No staff member with that id at this partner.');

    user.status = status;
    return this.staffToDto(await this.users.save(user));
  }

  async list(query: ListTenantsQueryDto): Promise<TenantListDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;

    const builder = this.tenants.createQueryBuilder('t');

    if (query.status) builder.andWhere('t.status = :status', { status: query.status });

    if (query.q?.trim()) {
      const term = `%${query.q.trim()}%`;
      builder.andWhere(
        new Brackets((where) => {
          where.where('t.name ILIKE :term', { term }).orWhere('t.slug ILIKE :term', { term });
        }),
      );
    }

    builder
      .orderBy('t.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await builder.getManyAndCount();

    return {
      items: rows.map((row) => this.toDto(row)),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async get(id: string): Promise<TenantDto> {
    return this.toDto(await this.getOrThrow(id));
  }

  /** Pending -> active only. Vets the tenant, which lifts the onboarding-links gate. */
  async approve(id: string): Promise<TenantDto> {
    const tenant = await this.getOrThrow(id);
    if (tenant.status !== TenantStatus.Pending) {
      throw new ConflictException(`This tenant is ${tenant.status}, not pending.`);
    }
    tenant.status = TenantStatus.Active;
    return this.toDto(await this.tenants.save(tenant));
  }

  /** Active -> suspended only. */
  async suspend(id: string): Promise<TenantDto> {
    const tenant = await this.getOrThrow(id);
    if (tenant.status !== TenantStatus.Active) {
      throw new ConflictException(`This tenant is ${tenant.status}, not active.`);
    }
    tenant.status = TenantStatus.Suspended;
    return this.toDto(await this.tenants.save(tenant));
  }

  /** Suspended -> active only. A pending tenant is approved, not reactivated. */
  async reactivate(id: string): Promise<TenantDto> {
    const tenant = await this.getOrThrow(id);
    if (tenant.status !== TenantStatus.Suspended) {
      throw new ConflictException(`This tenant is ${tenant.status}, not suspended.`);
    }
    tenant.status = TenantStatus.Active;
    return this.toDto(await this.tenants.save(tenant));
  }

  private async getOrThrow(id: string): Promise<Tenant> {
    const tenant = await this.tenants.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('No tenant with that id.');
    return tenant;
  }

  private toDto(tenant: Tenant): TenantDto {
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      createdAt: tenant.createdAt.toISOString(),
    };
  }

  private staffToDto(user: User): TenantStaffDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
