import type { MigrationInterface, QueryRunner } from 'typeorm';

interface SeedServiceFaq {
  question: string;
  answer: string;
}

interface SeedService {
  slug: string;
  iconName: string;
  title: string;
  summary: string;
  description: string;
  strand: 'education' | 'travel';
  metaTitle: string;
  metaDescription: string;
  whatsIncluded: string[];
  faqs: SeedServiceFaq[];
  relatedArticleSlugs: string[] | null;
}

/**
 * The six real Rakuxon services, transcribed verbatim from the frontend's
 * `content/services.ts` — real company copy, not fabricated content, so
 * seeding it as-is (rather than deleting it, as with the fake testimonials)
 * is correct. Icon names match the fixed lucide set the admin editor and
 * frontend both render from (`GraduationCap`, `Headphones`, `PlaneTakeoff`,
 * `Send`, `Stamp`, `Compass`).
 */
const SERVICES: readonly SeedService[] = [
  {
    slug: 'free-consultancy',
    iconName: 'Compass',
    title: 'Free Educational Consultancy',
    summary: 'Where every journey starts, at no cost.',
    description:
      'Complimentary expert guidance in choosing the right universities and courses that align with your academic goals and career aspirations.',
    strand: 'education',
    metaTitle: 'Free Study Abroad Consultation | Rakuxon Educational Consultancy',
    metaDescription:
      'Book a free educational consultancy with Rakuxon. Get expert, no-obligation guidance on universities and courses that fit your goals and budget, before you commit to anything.',
    whatsIncluded: [
      'A one-to-one conversation about your academic goals, budget and preferred destinations',
      'A shortlist of universities and courses matched to your grades and interests',
      'Honest guidance on whether you are ready to apply now or should build your profile first',
      'No obligation to apply anywhere: the consultation stands on its own',
    ],
    faqs: [
      {
        question: 'Is the consultation really free?',
        answer:
          'Yes. The first conversation costs nothing, whether or not you go on to apply through Rakuxon.',
      },
      {
        question: 'What should I bring to a consultation?',
        answer:
          'Nothing formal is required. A rough idea of your grades, budget and preferred subject or destination is enough to start with. We fill in the gaps together.',
      },
      {
        question: 'Do I have to apply through Rakuxon afterwards?',
        answer: 'No. The consultancy is advice, not a commitment. You decide what to do with it.',
      },
    ],
    relatedArticleSlugs: ['how-to-choose-a-university-abroad'],
  },
  {
    slug: 'university-applications',
    iconName: 'GraduationCap',
    title: 'University Selection & Application',
    summary: 'The whole application, managed.',
    description:
      'Comprehensive support in selecting the perfect educational institutions and managing the entire application process with precision and care.',
    strand: 'education',
    metaTitle: 'University Application Support & Guidance | Rakuxon',
    metaDescription:
      'End-to-end university application support: shortlisting institutions, preparing your documents, and managing submissions, so nothing is missed and nothing is late.',
    whatsIncluded: [
      'Help shortlisting universities and courses that match your profile',
      'Review of your personal statement, transcripts and supporting documents',
      'Application submission managed on your behalf, tracked start to finish',
      'A single point of contact for every university you apply to',
    ],
    faqs: [
      {
        question: 'How many universities can I apply to?',
        answer:
          'As many as make sense for your profile and goals. We help you decide on a realistic shortlist rather than applying everywhere at once.',
      },
      {
        question: 'Do you write my personal statement for me?',
        answer:
          'No. It has to be yours. We review it, ask the questions an admissions officer would, and help you sharpen it.',
      },
    ],
    relatedArticleSlugs: ['how-to-choose-a-university-abroad', 'personal-statement-that-is-about-you'],
  },
  {
    slug: 'visa-support',
    iconName: 'Stamp',
    title: 'Visa Application Support',
    summary: 'Documentation, interview prep, submission.',
    description:
      'Navigate complex visa requirements with our experienced team. We provide comprehensive assistance with documentation, interview preparation, and application submission.',
    strand: 'education',
    metaTitle: 'Student Visa Application Support | Rakuxon',
    metaDescription:
      "Student visa support from documentation to interview preparation and submission. We help you navigate your destination country's requirements without the guesswork.",
    whatsIncluded: [
      'A checklist of the documents your specific destination and visa type require',
      'Review of your financial and academic evidence before you submit',
      'Interview preparation, where your destination requires one',
      'Support through submission and any follow-up requests from the visa office',
    ],
    faqs: [
      {
        question: 'Which countries do you support visa applications for?',
        answer:
          'Every destination in our catalogue. Requirements differ by country, so we work from the rules that apply to the specific visa you are applying for.',
      },
      {
        question: 'Can you guarantee my visa will be approved?',
        answer:
          "No one can. The decision is the visa office's alone. What we do is make sure your application is complete, accurate and submitted on time, which is the part within your control.",
      },
    ],
    relatedArticleSlugs: [
      'proof-of-funds-for-student-visas',
      'uk-student-visa-order-of-events',
      'canada-study-permit-beyond-the-letter-of-acceptance',
    ],
  },
  {
    slug: 'pre-departure',
    iconName: 'PlaneTakeoff',
    title: 'Pre-departure & Arrival Support',
    summary: 'Landing somewhere new, with someone expecting you.',
    description:
      'Complete pre-departure and arrival services including accommodation assistance, airport transfers, job opportunity guidance, workplace advice, and cultural orientation.',
    strand: 'education',
    metaTitle: 'Pre-Departure & Arrival Support for International Students | Rakuxon',
    metaDescription:
      "From accommodation and airport transfers to workplace and cultural orientation, Rakuxon's pre-departure and arrival support helps you land settled, not scrambling.",
    whatsIncluded: [
      'Accommodation guidance before you leave, so you are not searching on arrival',
      'Airport transfer arrangements for your first day',
      'Orientation on daily life, workplace norms and culture in your destination',
      'Guidance on part-time work and job opportunities where your visa allows it',
    ],
    faqs: [
      {
        question: 'When should I start pre-departure planning?',
        answer:
          'As soon as your visa is approved. Accommodation and travel arrangements are easier to sort with weeks of lead time rather than days.',
      },
      {
        question: 'Do you help with accommodation directly, or just advice?',
        answer:
          'Both: guidance on what to look for and where, plus hands-on help making arrangements before you travel.',
      },
    ],
    relatedArticleSlugs: null,
  },
  {
    slug: 'ongoing-support',
    iconName: 'Headphones',
    title: 'Ongoing Client Support',
    summary: 'We do not stop at the offer letter.',
    description:
      "Continuous support throughout your academic and travel journey. We're here to help with any challenges you face while studying or traveling abroad.",
    strand: 'education',
    metaTitle: 'Ongoing Support for Students Abroad | Rakuxon',
    metaDescription:
      "Rakuxon's support does not end at enrolment. Continuous help throughout your time abroad, for whatever comes up after you have landed.",
    whatsIncluded: [
      'A continued point of contact after you have started your course',
      'Help working through problems that come up during your studies or travel',
      'Guidance on renewing documents, changing circumstances or extending your stay',
      'A relationship that outlasts the application, not one that ends at the offer letter',
    ],
    faqs: [
      {
        question: 'How long does ongoing support last?',
        answer:
          'For as long as you need it during your studies or time abroad. It is not limited to a fixed period after enrolment.',
      },
      {
        question: 'What kind of issues can you help with?',
        answer:
          'Anything from a document renewal to a change in circumstances. If it is unclear what to do next, that is exactly what this service is for.',
      },
    ],
    relatedArticleSlugs: null,
  },
  {
    slug: 'travels-tourism',
    iconName: 'Send',
    title: 'Travels and Tourism',
    summary: 'The other half of the business.',
    description:
      'Affordable luxury travel packages, flight booking, hotel reservations, and vacation planning. Experience the world with our expertly crafted travel solutions.',
    strand: 'travel',
    metaTitle: 'Travel Packages, Flights, Hotels, Hajj & Umrah | Rakuxon Travels & Tourism',
    metaDescription:
      'Flight booking, hotel reservations, Hajj and Umrah pilgrimage travel, and crafted holiday packages from Rakuxon\'s travel and tourism team, for pilgrimage, leisure and business trips alike.',
    whatsIncluded: [
      'Flight booking across your preferred dates and airlines',
      'Hotel reservations matched to your budget and itinerary',
      'Hajj and Umrah pilgrimage travel, arranged from flights through to accommodation',
      'Group tours, family holidays and business travel, not just solo trips',
      'Vacation planning, from a single city break to a multi-stop trip',
      'A travel package built around what you actually want to do, not a fixed template',
    ],
    faqs: [
      {
        question: 'Is this only for students travelling to study?',
        answer:
          'No. Travel and tourism is open to anyone planning a trip, whether or not it is connected to a study abroad journey.',
      },
      {
        question: 'Do you arrange Hajj and Umrah travel?',
        answer:
          'Yes. We arrange Hajj and Umrah pilgrimage travel, including flights, accommodation and group logistics, alongside our regular holiday and business travel packages.',
      },
      {
        question: 'Can you plan a multi-destination trip?',
        answer: 'Yes. Tell us the destinations and dates you have in mind and we will put together an itinerary.',
      },
    ],
    relatedArticleSlugs: null,
  },
];

export class Services1757003000000 implements MigrationInterface {
  name = 'Services1757003000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "service_strand_enum" AS ENUM ('education', 'travel');

      CREATE TABLE "services" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug" citext NOT NULL UNIQUE,
        "iconName" text NOT NULL,
        "title" text NOT NULL,
        "summary" text NOT NULL,
        "description" text NOT NULL,
        "strand" "service_strand_enum" NOT NULL,
        "metaTitle" text NOT NULL,
        "metaDescription" text NOT NULL,
        "whatsIncluded" text[] NOT NULL DEFAULT '{}',
        "faqs" jsonb NOT NULL DEFAULT '[]',
        "relatedArticleSlugs" text[],
        "status" "publish_status_enum" NOT NULL DEFAULT 'draft',
        "displayOrder" integer NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "services_status_idx" ON "services" ("status");
    `);

    for (const [index, service] of SERVICES.entries()) {
      await queryRunner.query(
        `INSERT INTO "services"
           ("slug", "iconName", "title", "summary", "description", "strand",
            "metaTitle", "metaDescription", "whatsIncluded", "faqs",
            "relatedArticleSlugs", "status", "displayOrder")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'published', $12)`,
        [
          service.slug,
          service.iconName,
          service.title,
          service.summary,
          service.description,
          service.strand,
          service.metaTitle,
          service.metaDescription,
          service.whatsIncluded,
          JSON.stringify(service.faqs),
          service.relatedArticleSlugs,
          index,
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "services";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "service_strand_enum";`);
  }
}
