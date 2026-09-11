import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { UserStatus } from '../../../contract/enums';

/**
 * A platform operator. Deliberately its own table, not a `role` value on
 * `users`: several admins exist with different, independently-assigned
 * permission sets (see `Permission`/`AdminPermission`), which a single enum
 * column cannot express. Global by nature — an admin is never scoped to a
 * tenant, so there is no `tenantId` here at all.
 */
@Entity('admins')
export class Admin {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'citext', unique: true })
  email!: string;

  /** Argon2id digest. Set directly by whoever creates the account — see AdminsService.create. */
  @Column({ type: 'text', select: false })
  passwordHash!: string;

  @Column({ type: 'text' })
  firstName!: string;

  @Column({ type: 'text' })
  lastName!: string;

  @Column({ type: 'enum', enum: UserStatus, enumName: 'user_status_enum', default: UserStatus.Active })
  status!: UserStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
