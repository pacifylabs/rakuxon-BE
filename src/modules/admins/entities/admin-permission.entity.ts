import { ForeignKey } from 'typeorm';
import { CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * One admin holding one permission. A composite key, not a surrogate id:
 * "does this admin hold this key" is the only question ever asked of this
 * table, and the pair is naturally unique.
 */
@Entity('admin_permissions')
@ForeignKey('admins', ['adminId'], ['id'], { name: 'admin_permissions_adminId_fkey', onDelete: 'CASCADE' })
@ForeignKey('permissions', ['permissionId'], ['id'], {
  name: 'admin_permissions_permissionId_fkey',
  onDelete: 'CASCADE',
})
@Index('admin_permissions_admin_idx', ['adminId'])
export class AdminPermission {
  @PrimaryColumn({ type: 'uuid' })
  adminId!: string;

  @PrimaryColumn({ type: 'uuid' })
  permissionId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
