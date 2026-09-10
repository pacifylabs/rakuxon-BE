import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { TenantStatus } from '../../../contract/enums';

/**
 * An agency — or the one house tenant a direct student signup belongs to
 * (`HOUSE_TENANT_ID`, seeded by `StudentsAndHouseTenant1757000800000`). The
 * root of every tenant-scoped row in the system.
 *
 * Global by nature — it is the table the RLS policies key off, so it carries
 * no tenant_id of its own.
 */
@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  /** Subdomain label. Lowercase, unique, and how a request resolves a tenant. */
  @Column({ type: 'citext', unique: true })
  slug!: string;

  @Column({ type: 'enum', enum: TenantStatus, enumName: 'tenant_status_enum', default: TenantStatus.Pending })
  status!: TenantStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
