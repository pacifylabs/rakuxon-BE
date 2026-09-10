import { ForeignKey } from 'typeorm';
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
@ForeignKey('tenants', ['tenantId'], ['id'], { name: 'users_tenantId_fkey', onDelete: 'CASCADE' })
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
  firstName!: string;

  @Column({ type: 'text' })
  lastName!: string;

  @Column({ type: 'enum', enum: Role, enumName: 'user_role_enum' })
  role!: Role;

  @Column({ type: 'enum', enum: UserStatus, enumName: 'user_status_enum', default: UserStatus.Active })
  status!: UserStatus;

  /** Null until the address is confirmed via a verification link. Not a sign-in gate. */
  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
