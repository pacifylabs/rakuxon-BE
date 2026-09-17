import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * A reference list seeded by migration, with two admin-editable flags:
 * `isDestination` (are we serving this country) and `homepageFeaturedOrder`
 * (is it shown on the homepage, and where). Exists so profile and address
 * forms can offer a dropdown instead of free text.
 */
@Entity('countries')
export class Country {
  /** ISO 3166-1 alpha-2. */
  @PrimaryColumn({ type: 'varchar', length: 2 })
  code!: string;

  @Column({ type: 'text' })
  name!: string;

  /** Whether the catalogue has universities in this country. */
  @Column({ type: 'boolean', default: false })
  isDestination!: boolean;

  /** Regional-indicator pair, e.g. 🇬🇧. Stored, not computed, so every API consumer gets the same one. */
  @Column({ type: 'text' })
  flagEmoji!: string;

  /** Null: not shown on the homepage. A number: its position there. */
  @Column({ type: 'int', nullable: true })
  homepageFeaturedOrder!: number | null;
}
