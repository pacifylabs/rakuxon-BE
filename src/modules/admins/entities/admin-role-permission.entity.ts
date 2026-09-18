import { Entity, ForeignKey, PrimaryColumn } from 'typeorm';

@Entity('admin_role_permissions')
@ForeignKey('admin_roles', ['roleId'], ['id'], {
  name: 'admin_role_permissions_roleId_fkey',
  onDelete: 'CASCADE',
})
@ForeignKey('permissions', ['permissionId'], ['id'], {
  name: 'admin_role_permissions_permissionId_fkey',
  onDelete: 'CASCADE',
})
export class AdminRolePermission {
  @PrimaryColumn({ type: 'uuid' })
  roleId!: string;

  @PrimaryColumn({ type: 'uuid' })
  permissionId!: string;
}
