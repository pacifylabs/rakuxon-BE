import { ForeignKey } from 'typeorm';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Links a provider account to a platform user. */
@Entity('sso_identities')
@ForeignKey('users', ['userId'], ['id'], { name: 'sso_identities_userId_fkey', onDelete: 'CASCADE' })
@Index('sso_identities_provider_account_unique', ['provider', 'providerAccountId'], {
  unique: true,
})
export class SsoIdentity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'text' })
  provider!: string;

  /** The provider's stable subject id — not the email, which can change. */
  @Column({ type: 'text' })
  providerAccountId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
