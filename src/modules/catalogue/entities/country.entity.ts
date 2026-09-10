import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * A reference list, not editable through the API: every row comes from the
 * seed migration. Exists so profile and address forms can offer a dropdown
 * instead of free text.
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
}
