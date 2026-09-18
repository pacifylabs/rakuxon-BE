import type { MigrationInterface, QueryRunner } from 'typeorm';

interface SeedFact {
  label: string;
  value: string;
  hint?: string;
}

interface SeedDestination {
  slug: string;
  name: string;
  shortName: string;
  cardImageUrl: string;
  cardImageAlt: string;
  heroImageUrl: string;
  heroImageAlt: string;
  tagline: string;
  intro: string;
  whyHeading: string;
  why: string;
  whyPoints: string[];
  facts: SeedFact[];
  universities: string[];
  helpPoints: string[];
}

/**
 * The six written destination guides, transcribed verbatim from the
 * frontend's `content/destinations.ts` — real company copy the client
 * already approved, seeded as-is rather than starting from a blank editor.
 */
const DESTINATIONS: readonly SeedDestination[] = [
  {
    slug: 'uk',
    name: 'the United Kingdom',
    shortName: 'United Kingdom',
    cardImageUrl: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80',
    cardImageAlt: 'Aerial view of London with Tower Bridge and the River Thames',
    heroImageUrl: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=1400&q=80',
    heroImageAlt: 'Aerial view of London with Tower Bridge and the River Thames',
    tagline: 'One-year masters, and a graduate route that buys you time.',
    intro:
      'The UK packs a masters into twelve months, which means one year of tuition and living costs rather than two. That single fact changes the arithmetic for a lot of students.',
    whyHeading: 'Why students choose the UK',
    why: 'Degrees are short, widely recognised, and taught in English throughout. The Graduate Route lets most masters graduates stay and work for two years after finishing, so the course is not the end of the plan.',
    whyPoints: [
      'Taught masters usually complete in twelve months',
      'Graduate Route: two years of post-study work for most masters graduates',
      'No language barrier outside the classroom either',
      'Dense university network, so you are rarely far from another campus',
    ],
    facts: [
      { label: 'Main intake', value: 'September', hint: 'A smaller January intake exists at many universities.' },
      { label: 'Typical tuition', value: '£14,000 – £30,000', hint: 'Per year, international postgraduate. Medicine and MBA run higher.' },
      { label: 'Living costs', value: '£1,000 – £1,500 / month', hint: 'London sits at the top of that range; the north sits well below it.' },
      { label: 'Post-study work', value: '2 years', hint: 'Graduate Route, for eligible masters graduates.' },
      { label: 'Apply by', value: 'Jan – Jun', hint: 'For a September start. Earlier is materially better for competitive courses.' },
      { label: 'Language proof', value: 'IELTS / equivalent', hint: 'Some universities waive it if you were taught in English.' },
    ],
    universities: ['Northfield University', 'Kingsbridge University', 'Ardenmoor College'],
    helpPoints: [
      'Check your transcripts against UK entry requirements before you apply',
      'Flag the CAS and financial-evidence documents early, because they hold visas up',
      'Track every application against the real UCAS and university deadlines',
    ],
  },
  {
    slug: 'canada',
    name: 'Canada',
    shortName: 'Canada',
    cardImageUrl: 'https://images.unsplash.com/photo-1517935706615-2717063c2225?w=800&q=80',
    cardImageAlt: 'Toronto city skyline',
    heroImageUrl: 'https://images.unsplash.com/photo-1517935706615-2717063c2225?w=1400&q=80',
    heroImageAlt: 'Toronto city skyline',
    tagline: 'A study permit that leads somewhere, if you plan it properly.',
    intro:
      'Canada is chosen less for the degree itself than for what follows it. The post-graduation work permit and the residency pathways behind it are the actual draw, and they depend on choices you make before you apply.',
    whyHeading: 'Why students choose Canada',
    why: 'Tuition sits below comparable US institutions, the post-graduation work permit can run up to three years, and there is a well-trodden route from work experience to permanent residency. The catch is that not every programme and not every institution qualifies.',
    whyPoints: [
      'Post-graduation work permit of up to three years',
      'Recognised pathways from work experience toward residency',
      'Lower tuition than comparable institutions in the United States',
      'Designated Learning Institution status matters: check it before you commit',
    ],
    facts: [
      { label: 'Main intakes', value: 'September, January', hint: 'A smaller May intake is common at colleges.' },
      { label: 'Typical tuition', value: 'CAD 20,000 – 40,000', hint: 'Per year, international. Colleges sit below universities.' },
      { label: 'Living costs', value: 'CAD 1,200 – 2,000 / month', hint: 'Toronto and Vancouver are the expensive end.' },
      { label: 'Post-study work', value: 'Up to 3 years', hint: 'PGWP length tracks programme length.' },
      { label: 'Proof of funds', value: 'Required', hint: 'Held for the study permit application, separate from tuition.' },
      { label: 'Apply by', value: 'Dec – Mar', hint: 'For a September start, allowing time for the permit.' },
    ],
    universities: ['Westbrook College', 'Lakeside Institute', 'Fairhaven University'],
    helpPoints: [
      'Confirm the programme carries Designated Learning Institution status',
      'Get proof-of-funds documentation right first time: it is the most common permit delay',
      'Line applications up across both the September and January intakes',
    ],
  },
  {
    slug: 'usa',
    name: 'the United States',
    shortName: 'United States',
    cardImageUrl: 'https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?w=800&q=80',
    cardImageAlt: 'New York City skyline at sunset',
    heroImageUrl: 'https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?w=1400&q=80',
    heroImageAlt: 'New York City skyline at sunset',
    tagline: 'The widest choice, and the longest lead time.',
    intro:
      'No country offers more variety, in institution, funding model, or location. It also asks the most of you up front: standardised tests, essays, recommendations, and a visa interview.',
    whyHeading: 'Why students choose the United States',
    why: 'Scale. There are thousands of accredited institutions, from community colleges to research universities, and funding for international students genuinely exists at many of them. Optional Practical Training extends significantly for STEM graduates.',
    whyPoints: [
      'The broadest range of institutions and programmes anywhere',
      'Real scholarship and assistantship funding at many universities',
      'OPT gives twelve months of work, extended to three years for STEM',
      'Campus-based study with strong research funding',
    ],
    facts: [
      { label: 'Main intake', value: 'Fall (August)', hint: 'Spring intake exists but has less funding attached.' },
      { label: 'Typical tuition', value: 'USD 25,000 – 60,000', hint: 'Public in-state is far lower; private research universities sit at the top.' },
      { label: 'Living costs', value: 'USD 1,200 – 2,500 / month', hint: 'Coastal cities are the expensive end.' },
      { label: 'Post-study work', value: '1 – 3 years', hint: 'OPT, with a STEM extension.' },
      { label: 'Tests', value: 'TOEFL / IELTS, sometimes GRE', hint: 'Requirements vary widely by programme.' },
      { label: 'Apply by', value: 'Oct – Jan', hint: 'For a Fall start. Funding deadlines fall earlier than admission deadlines.' },
    ],
    universities: ['Northfield University', 'Fairhaven University', 'Lakeside Institute'],
    helpPoints: [
      'Separate the admission deadline from the funding deadline: they are rarely the same',
      'Keep test scores, recommendations and transcripts in one place across many applications',
      'Prepare the I-20 and financial documentation before the visa interview',
    ],
  },
  {
    slug: 'ireland',
    name: 'Ireland',
    shortName: 'Ireland',
    cardImageUrl: 'https://images.unsplash.com/photo-1549918864-48ac978761a4?w=800&q=80',
    cardImageAlt: 'Dublin street and architecture',
    heroImageUrl: 'https://images.unsplash.com/photo-1549918864-48ac978761a4?w=1400&q=80',
    heroImageAlt: 'Dublin street and architecture',
    tagline: 'English-speaking, inside the EU, and small enough to navigate.',
    intro:
      'Ireland is the English-speaking country still inside the European Union, which makes it unusual. For students who want EU access without learning a new language, that combination is hard to replicate.',
    whyHeading: 'Why students choose Ireland',
    why: 'Taught masters run twelve months, the Third Level Graduate Programme allows up to two years of post-study stay, and a genuinely large technology and pharmaceutical sector sits within commuting distance of the main campuses.',
    whyPoints: [
      'English-speaking and inside the EU',
      'One-year taught masters at most universities',
      'Up to two years to stay and work after graduating',
      'Concentrated technology and pharmaceutical employers',
    ],
    facts: [
      { label: 'Main intake', value: 'September', hint: 'January intake is limited.' },
      { label: 'Typical tuition', value: '€12,000 – €25,000', hint: 'Per year, international. Business and computing sit higher.' },
      { label: 'Living costs', value: '€1,000 – €1,600 / month', hint: 'Dublin accommodation is the binding constraint, not tuition.' },
      { label: 'Post-study work', value: 'Up to 2 years', hint: 'Third Level Graduate Programme.' },
      { label: 'Apply by', value: 'Jan – Jul', hint: 'Housing is scarcer than places, so apply early for both.' },
      { label: 'Language proof', value: 'IELTS / equivalent', hint: 'Waivers are common for English-medium prior study.' },
    ],
    universities: ['Ardenmoor College', 'Kingsbridge University'],
    helpPoints: [
      'Start the accommodation search at the same time as the application, not after the offer',
      'Check whether your prior degree qualifies for an English-language waiver',
      'Plan the visa financial evidence around Dublin costs, not the national average',
    ],
  },
  {
    slug: 'australia',
    name: 'Australia',
    shortName: 'Australia',
    cardImageUrl: 'https://images.unsplash.com/photo-1523482580672-f109ba8cb9be?w=800&q=80',
    cardImageAlt: 'Sydney Opera House and harbour',
    heroImageUrl: 'https://images.unsplash.com/photo-1523482580672-f109ba8cb9be?w=1400&q=80',
    heroImageAlt: 'Sydney Opera House and harbour',
    tagline: 'Work rights during study, not just after it.',
    intro:
      'Australia lets student visa holders work substantial hours during term. For students partly funding themselves, that changes what is affordable in a way post-study rights alone do not.',
    whyHeading: 'Why students choose Australia',
    why: 'Generous work rights while studying, a temporary graduate visa afterwards, and a skilled-occupation system that rewards choosing your field deliberately. Universities are concentrated in a handful of large, liveable cities.',
    whyPoints: [
      'Substantial work rights during term time',
      'Temporary graduate visa of two to four years depending on qualification',
      'Skilled occupation lists reward choosing your field with intent',
      'February and July intakes give you two shots a year',
    ],
    facts: [
      { label: 'Main intakes', value: 'February, July', hint: 'Two full intakes, not one plus a remainder.' },
      { label: 'Typical tuition', value: 'AUD 25,000 – 45,000', hint: 'Per year, international.' },
      { label: 'Living costs', value: 'AUD 1,500 – 2,300 / month', hint: 'Sydney and Melbourne sit at the top.' },
      { label: 'Post-study work', value: '2 – 4 years', hint: 'Temporary Graduate visa, by qualification level.' },
      { label: 'Health cover', value: 'OSHC required', hint: 'Overseas Student Health Cover is a visa condition.' },
      { label: 'Apply by', value: 'Sep – Nov', hint: 'For a February start.' },
    ],
    universities: ['Lakeside Institute', 'Westbrook College'],
    helpPoints: [
      'Check your intended occupation against the skilled lists before choosing a course',
      'Budget OSHC into the total cost: it is mandatory, not optional',
      'Use both intakes: a July start is not a fallback, it is a real option',
    ],
  },
  {
    slug: 'germany',
    name: 'Germany',
    shortName: 'Germany',
    cardImageUrl: 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=800&q=80',
    cardImageAlt: 'Half-timbered houses on a street in a historic German town',
    heroImageUrl: 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=1400&q=80',
    heroImageAlt: 'Half-timbered houses on a street in a historic German town',
    tagline: 'Public universities with little or no tuition fee.',
    intro:
      'Most public German universities charge no tuition fee, including to international students. You pay a semester contribution instead. The cost of studying in Germany is mostly the cost of living there.',
    whyHeading: 'Why students choose Germany',
    why: 'The economics are unusual: no tuition at most public universities, a blocked-account requirement that is a savings threshold rather than a fee, and eighteen months after graduation to find work. Many masters programmes are taught entirely in English.',
    whyPoints: [
      'No tuition fee at most public universities',
      'Eighteen months post-study to find relevant work',
      'A large number of English-taught masters programmes',
      'Strong engineering and applied-science reputation',
    ],
    facts: [
      { label: 'Main intakes', value: 'October, April', hint: 'Winter semester is the larger of the two.' },
      { label: 'Typical tuition', value: '€0 – €500 / semester', hint: 'Semester contribution at public universities. Private institutions charge fees.' },
      { label: 'Living costs', value: '€900 – €1,400 / month', hint: 'Munich is the expensive end; smaller cities are notably cheaper.' },
      { label: 'Blocked account', value: '~€11,900', hint: 'Held as proof of funds for the visa, drawn down monthly.' },
      { label: 'Post-study work', value: '18 months', hint: 'To find employment relevant to your qualification.' },
      { label: 'Apply by', value: 'May – Jul', hint: 'For an October start. Uni-assist processing adds weeks.' },
    ],
    universities: ['Kingsbridge University', 'Ardenmoor College'],
    helpPoints: [
      'Get certified translations of your transcripts early: uni-assist will require them',
      'Open the blocked account well before the visa appointment',
      'Confirm whether your programme is taught in English or German before applying',
    ],
  },
];

export class Destinations1757003500000 implements MigrationInterface {
  name = 'Destinations1757003500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "destinations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug" citext NOT NULL UNIQUE,
        "name" text NOT NULL,
        "shortName" text NOT NULL,
        "cardImageUrl" text,
        "cardImageAlt" text NOT NULL DEFAULT '',
        "heroImageUrl" text,
        "heroImageAlt" text NOT NULL DEFAULT '',
        "tagline" text NOT NULL,
        "intro" text NOT NULL,
        "whyHeading" text NOT NULL,
        "why" text NOT NULL,
        "whyPoints" text[] NOT NULL DEFAULT '{}',
        "facts" jsonb NOT NULL DEFAULT '[]',
        "universities" text[] NOT NULL DEFAULT '{}',
        "helpPoints" text[] NOT NULL DEFAULT '{}',
        "status" "publish_status_enum" NOT NULL DEFAULT 'draft',
        "displayOrder" integer NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "destinations_status_idx" ON "destinations" ("status");
    `);

    for (const [index, destination] of DESTINATIONS.entries()) {
      await queryRunner.query(
        `INSERT INTO "destinations"
           ("slug", "name", "shortName", "cardImageUrl", "cardImageAlt", "heroImageUrl", "heroImageAlt",
            "tagline", "intro", "whyHeading", "why", "whyPoints", "facts", "universities", "helpPoints",
            "status", "displayOrder")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'published', $16)`,
        [
          destination.slug,
          destination.name,
          destination.shortName,
          destination.cardImageUrl,
          destination.cardImageAlt,
          destination.heroImageUrl,
          destination.heroImageAlt,
          destination.tagline,
          destination.intro,
          destination.whyHeading,
          destination.why,
          destination.whyPoints,
          JSON.stringify(destination.facts),
          destination.universities,
          destination.helpPoints,
          index,
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "destinations";`);
  }
}
