import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import type { ListTenantsQueryDto, TenantDto, TenantListDto } from './dto/tenant.dto';
import { Tenant } from './entities/tenant.entity';
import { TenantStatus } from '../../contract/enums';

@Injectable()
export class TenantsService {
  constructor(@InjectRepository(Tenant) private readonly tenants: Repository<Tenant>) {}

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
}
