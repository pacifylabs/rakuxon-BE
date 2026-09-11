import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One grantable capability, e.g. `tenants.approve`.
 *
 * A catalogue, not an enum: new keys ship as additive migrations (insert a
 * row) rather than a schema change to every place that reads a fixed role
 * list. `AdminPermission` is the join that says which admin holds which key.
 */
@Entity('permissions')
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', unique: true })
  key!: string;

  @Column({ type: 'text' })
  description!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
