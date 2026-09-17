import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * One option in the preferred-intake dropdown, e.g. "September 2026".
 * Admin-managed reference data — there is no external source to seed this
 * from the way Countries has ISO 3166, so it starts empty and an admin adds
 * to it as intake windows come up.
 */
@Entity('intake_terms')
export class IntakeTerm {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  label!: string;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  /** Soft delete: an intake term already chosen by a student must not vanish from history. */
  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
