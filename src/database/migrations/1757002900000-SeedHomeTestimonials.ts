import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The six real, named client quotes that used to be hardcoded in the
 * frontend's `home.ts` (`TESTIMONIALS`, docs/04b § 3.8) — transcribed
 * verbatim from rakuxon.com, the same as this migration copies them. Now
 * that the homepage fetches from `GET /testimonials` instead, this is the
 * one place the content lives, and it's admin-editable from here on rather
 * than requiring a deploy to change. No photo for any of them, matching the
 * frontend's own rule: a real name paired with a stock portrait is a
 * misrepresentation, not decoration.
 */
const HOME_TESTIMONIALS: readonly { quote: string; authorName: string; detail: string }[] = [
  {
    quote:
      'Rakuxon Ltd made my dream of studying at Oxford University come true. Their guidance through the application process was invaluable, and their support never wavered. Truly where minds meet maps!',
    authorName: 'Sarah Adebayo',
    detail: 'Oxford University, UK',
  },
  {
    quote:
      "From university admission to travel arrangements, Rakuxon Ltd handled everything perfectly. I'm now studying at MIT and had amazing travel experiences during breaks, all thanks to their comprehensive services.",
    authorName: 'Michael Okafor',
    detail: 'MIT, USA',
  },
  {
    quote:
      "Rakuxon Ltd didn't just help me get into the University of Toronto, they also arranged my pre-departure travel and arrival support. Their travel services are exceptional — truly professional in every way.",
    authorName: 'Fatima Kone',
    detail: 'University of Toronto, Canada',
  },
  {
    quote:
      'The free consultation at Rakuxon Ltd was incredibly detailed and helpful. They took time to understand my goals and provided personalized recommendations. Their expertise made all the difference in my successful application to Cambridge.',
    authorName: 'David Adamu',
    detail: 'Cambridge University, UK',
  },
  {
    quote:
      "Rakuxon Ltd planned our honeymoon to Dubai, and it was beyond perfect. From airport pickup to luxury hotel bookings and desert tours, everything was seamless. We'll definitely book with them again!",
    authorName: 'Amaka & Chinedu Eze',
    detail: 'Dubai, UAE',
  },
  {
    quote:
      'As a solo traveller, I was nervous about exploring Europe. But Rakuxon Ltd arranged my itinerary across Paris, Rome, and Barcelona — with every hotel, flight, and activity perfectly planned. I felt safe and stress-free the entire time.',
    authorName: 'Tomiwa Adedeji',
    detail: 'Europe Tour',
  },
];

export class SeedHomeTestimonials1757002900000 implements MigrationInterface {
  name = 'SeedHomeTestimonials1757002900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [index, testimonial] of HOME_TESTIMONIALS.entries()) {
      await queryRunner.query(
        `INSERT INTO "testimonials"
           ("quote", "authorName", "detail", "placement", "status", "displayOrder")
         VALUES ($1, $2, $3, '{home}', 'published', $4)`,
        [testimonial.quote, testimonial.authorName, testimonial.detail, index],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const testimonial of HOME_TESTIMONIALS) {
      await queryRunner.query(
        `DELETE FROM "testimonials" WHERE "authorName" = $1 AND "quote" = $2`,
        [testimonial.authorName, testimonial.quote],
      );
    }
  }
}
