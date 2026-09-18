import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Contact details, social links, footer copy and the brand logo — a single
 * row, seeded with today's real values (transcribed from rakuxon.com, same
 * as the Services and Testimonials seeds), replacing what used to be
 * hardcoded in the frontend's `content/site.ts`. No permission migration:
 * reuses content.view/content.manage, the same trust tier as Services and
 * Testimonials.
 */
export class SiteSettings1757003100000 implements MigrationInterface {
  name = 'SiteSettings1757003100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "site_settings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "contactEmail" text NOT NULL,
        "contactPhones" text[] NOT NULL DEFAULT '{}',
        "contactAddresses" jsonb NOT NULL DEFAULT '[]',
        "socials" jsonb NOT NULL DEFAULT '[]',
        "footerTagline" text NOT NULL,
        "footerBlurb" text NOT NULL,
        "logoUrl" text NOT NULL,
        "logoDarkUrl" text NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(
      `INSERT INTO "site_settings"
         ("contactEmail", "contactPhones", "contactAddresses", "socials",
          "footerTagline", "footerBlurb", "logoUrl", "logoDarkUrl")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        'enquiries@rakuxon.com',
        ['+234 816 717 8847', '+44 776 094 4935'],
        JSON.stringify([
          {
            label: 'UK office',
            lines: ['Flat 15, St. Matthews House', 'Phelp Street, London SE17 2PJ'],
          },
          { label: 'Nigeria office', lines: ['11 Akinsemoyin Street', 'Surulere, Lagos'] },
        ]),
        JSON.stringify([
          { label: 'WhatsApp', href: 'https://wa.me/2348167178847' },
          { label: 'Instagram', href: 'https://www.instagram.com/rakuxon' },
          { label: 'TikTok', href: 'https://www.tiktok.com/@rakuxonltd' },
          { label: 'X', href: 'https://x.com/rakuxon' },
          { label: 'Facebook', href: 'https://www.facebook.com/rakuxon' },
          { label: 'YouTube', href: 'https://youtube.com/@rakuxon' },
        ]),
        'Where Minds Meet Maps.',
        'Transforming dreams into global education and travel opportunities. Your trusted partner for studying abroad and exploring the world.',
        '/logo-light.png',
        '/logo-dark.png',
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "site_settings";`);
  }
}
