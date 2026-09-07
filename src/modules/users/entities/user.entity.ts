import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Role, UserStatus } from '../../../contract/enums';

/**
 * A person who can sign in.
 *
 * Email is unique *per tenant*, not globally: the same person may legitimately
 * be a counselor at one agency and a student at another, and a global unique
 * index would leak the existence of an account across tenants.
 */
@Entity('users')
@Index('users_tenant_email_unique', ['tenantId', 'email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Null only for platform_admin, who sits above every tenant. */
  @Column({ type: 'uuid', nullable: true })
  tenantId!: string | null;

  @Column({ type: 'citext' })
  email!: string;

  /** Argon2id digest. Null for accounts that only ever sign in through SSO. */
  @Column({ type: 'text', nullable: true, select: false })
  passwordHash!: string | null;

  @Column({ type: 'text' })
  fullName!: string;

  @Column({ type: 'enum', enum: Role })
  role!: Role;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.Active })
  status!: UserStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
