import { StudyLevel } from '../../src/contract/enums';
import {
  countryCodeFor,
  courseSearchQuery,
  distinctiveName,
  edvoyCountryName,
  groupByInstitutionAndCountry,
  indexInstitutions,
  institutionAlias,
  institutionKey,
  normaliseEdvoyCourse,
} from './edvoy-courses';
import type { EdvoyCourse, NormalisedCourse } from './edvoy-courses';

/** Rows copied from the feed as supplied, trimmed to the fields that matter. */
const derbyPsychology: EdvoyCourse = {
  name: 'BSc (Hons) Psychology',
  refId: 'university-of-derby|bsc-hons-psychology',
  slug: 'bsc-hons-psychology',
  edpRefId: 'university-of-derby',
  courseLevel: 'Undergraduate',
  courseSummary: null,
  approxAnnualFee: '17500',
  expressOffer: false,
  currency: 'GBP',
  subjects: ['psychology'],
  institution: {
    name: 'University of Derby',
    slug: 'university-of-derby',
    address: { country: 'United Kingdom' },
  },
};

const astonDataScience: EdvoyCourse = {
  ...derbyPsychology,
  name: 'MSc Data Science',
  refId: 'aston-university-london|msc-data-science',
  slug: 'msc-data-science',
  edpRefId: 'aston-university-london',
  courseLevel: 'Postgraduate',
  approxAnnualFee: '24800',
  expressOffer: true,
  subjects: ['data-sciences-and-big-data'],
  institution: {
    name: 'Aston University London',
    slug: 'aston-university-london',
    address: { country: 'United Kingdom' },
  },
};

const ok = (row: EdvoyCourse) => {
  const result = normaliseEdvoyCourse(row);
  if (!result.ok) throw new Error(`expected a course, got: ${result.reason}`);
  return result.course;
};

const rejected = (row: EdvoyCourse) => {
  const result = normaliseEdvoyCourse(row);
  if (result.ok) throw new Error('expected a rejection');
  return result.reason;
};

describe('normaliseEdvoyCourse', () => {
  it('maps a row as supplied', () => {
    expect(ok(derbyPsychology)).toEqual({
      sourceRef: 'university-of-derby|bsc-hons-psychology',
      institutionRef: 'university-of-derby',
      institutionName: 'University of Derby',
      country: 'United Kingdom',
      courseSlug: 'bsc-hons-psychology',
      title: 'BSc (Hons) Psychology',
      level: StudyLevel.Undergraduate,
      disciplines: ['psychology'],
      overview: null,
      tuitionAmount: '17500.00',
      tuitionCurrency: 'GBP',
      fastTrackOffer: false,
    });
  });

  it('carries an express offer through as a fast-track offer', () => {
    const course = ok(astonDataScience);
    expect(course.fastTrackOffer).toBe(true);
    expect(course.level).toBe(StudyLevel.Postgraduate);
  });

  it('keeps every subject once, in order', () => {
    expect(ok({ ...derbyPsychology, subjects: ['applied-sociology', 'health-care', 'health-care'] })
      .disciplines).toEqual(['applied-sociology', 'health-care']);
  });

  it('rejects a level it does not know rather than guessing one', () => {
    // Filing a foundation year under "undergraduate" puts it in front of people
    // filtering for a degree.
    expect(rejected({ ...derbyPsychology, courseLevel: 'Diploma' })).toBe('unmapped level "diploma"');
  });

  it('files a pre-masters course under Foundation', () => {
    expect(ok({ ...derbyPsychology, courseLevel: 'PreMasters' }).level).toBe(StudyLevel.Foundation);
  });

  it('still rejects language and pre-sessional courses, which no study level fits', () => {
    expect(rejected({ ...derbyPsychology, courseLevel: 'Language' })).toBe('unmapped level "language"');
    expect(rejected({ ...derbyPsychology, courseLevel: 'PreSessionalEnglish' })).toBe(
      'unmapped level "presessionalenglish"',
    );
  });

  it('drops an amount that arrives without a currency', () => {
    // "17500" alone would render in whatever currency the page defaulted to.
    const course = ok({ ...derbyPsychology, currency: null });
    expect(course.tuitionAmount).toBeNull();
    expect(course.tuitionCurrency).toBeNull();
  });

  it.each([['None'], [''], ['0'], ['-50'], ['99999999']])(
    'drops a fee of %p rather than storing it',
    (fee) => {
      expect(ok({ ...derbyPsychology, approxAnnualFee: fee }).tuitionAmount).toBeNull();
    },
  );

  it('treats a blank summary as no summary', () => {
    expect(ok({ ...derbyPsychology, courseSummary: '   ' }).overview).toBeNull();
    expect(ok({ ...derbyPsychology, courseSummary: ' Taught in Derby. ' }).overview).toBe(
      'Taught in Derby.',
    );
  });

  it('rejects a row with no id, because an upsert cannot key on nothing', () => {
    expect(rejected({ ...derbyPsychology, refId: undefined })).toBe('missing refId');
  });

  it('rejects a slug that would not be safe in a URL', () => {
    expect(rejected({ ...derbyPsychology, slug: '../admin' })).toBe('bad slug');
  });

  it('ignores fields of the wrong type instead of trusting them', () => {
    const course = ok({
      ...derbyPsychology,
      expressOffer: 'true',
      subjects: 'psychology',
      approxAnnualFee: { amount: 1 },
    });

    expect(course.fastTrackOffer).toBe(false);
    expect(course.disciplines).toEqual([]);
    expect(course.tuitionAmount).toBeNull();
  });
});

describe('institutionKey', () => {
  it('matches names written slightly differently', () => {
    expect(institutionKey('The University of Derby')).toBe(institutionKey('University of Derby'));
    expect(institutionKey('Technische Universität München')).toBe(
      institutionKey('Technische Universitat Munchen'),
    );
    expect(institutionKey('Queen Mary, University of London')).toBe(
      institutionKey('Queen Mary University of London'),
    );
  });

  it('keeps genuinely different institutions apart', () => {
    expect(institutionKey('Aston University London')).not.toBe(institutionKey('Aston University'));
  });
});

describe('courseSearchQuery', () => {
  it('reproduces a request captured from the site, byte for byte', () => {
    // Captured 2026-09-10: page 1 of the United States at 15 per page. The
    // live feed returned the same total, rows and order for both.
    const captured =
      'limit=15&offset=1&locations=%255B%257B%2522key%2522%253A%2522United%2520States%2522%252C%2522values%2522%253A%255B%255D%257D%255D&query=%2522%2522&courseLevel=undefined&academicScholarshipAvailable=false&earlyBirdScholarshipAvailable=false&attendanceTypes=undefined&subjects=undefined&intakes=undefined&intakeYears=undefined&intakeMonths=undefined&courseDurationTypes=undefined&institutionSlug=%2522%2522&expressOffer=false&budget=%257B%2522min%2522%253A0%252C%2522max%2522%253A214000%257D&institution=undefined&sortNumber=0&eligibilityCriteriaDetails=%257B%257D&categoryFilter=%2522High%2522&studiedMajor=undefined';

    expect(courseSearchQuery('United States', 1, 15)).toBe(captured);
  });

  it('keeps the stable sort in every request', () => {
    // Without sortNumber=0 the order drifts between requests.
    expect(courseSearchQuery('Malta', 0, 100)).toContain('sortNumber=0');
  });
});

describe('edvoyCountryName', () => {
  it('uses the Edvoy spelling where it differs from ours', () => {
    expect(edvoyCountryName('NL', 'The Netherlands')).toBe('Netherlands');
  });

  it('keeps our spelling everywhere else', () => {
    expect(edvoyCountryName('GB', 'United Kingdom')).toBe('United Kingdom');
  });
});

describe('countryCodeFor', () => {
  const ours = new Map([
    ['united kingdom', 'GB'],
    ['the netherlands', 'NL'],
    ['united states', 'US'],
  ]);

  it('prefers the country of the institution itself, so a cross-listed course stays with its campus', () => {
    expect(countryCodeFor('United Kingdom', 'US', ours)).toBe('GB');
  });

  it('falls back to the country it was fetched under when the spelling differs from ours', () => {
    expect(countryCodeFor('Netherlands', 'NL', ours)).toBe('NL');
  });

  it('returns nothing when neither is known', () => {
    expect(countryCodeFor('Georgia', undefined, ours)).toBeUndefined();
  });
});

describe('distinctiveName', () => {
  const d = (name: string) => distinctiveName(institutionKey(name));

  it('sees one place under two labels', () => {
    // Both would have been created as duplicates by exact matching alone.
    expect(d('Ulster University')).toBe(d('University of Ulster'));
    expect(d('Wittenborg - University of Applied Sciences')).toBe(d('Wittenborg University'));
  });

  it('keeps apart places that only share a city or a region', () => {
    expect(d('Queensland University of Technology')).not.toBe(d('University of Queensland'));
    expect(d('Birmingham City University')).not.toBe(d('University of Birmingham'));
    expect(d('Tokyo University of Science')).not.toBe(d('University of Tokyo'));
  });

  it('reduces a purely generic name to nothing, so it can never match', () => {
    expect(d('The University')).toBe('');
  });
});

describe('groupByInstitutionAndCountry', () => {
  const ours = new Map([
    ['united kingdom', 'GB'],
    ['united arab emirates', 'AE'],
    ['the netherlands', 'NL'],
  ]);
  const course = (over: Partial<NormalisedCourse>): NormalisedCourse => ({ ...ok(derbyPsychology), ...over });

  it('keeps a campus in another country apart from the main institution', () => {
    // One Edvoy id covers Birmingham and its Dubai campus. Resolving the id once,
    // in the first country fetched, would have moved all 155 courses to a new
    // UAE record.
    const uk = course({
      sourceRef: 'bham|a',
      institutionRef: 'university-of-birmingham',
      institutionName: 'University of Birmingham',
      country: 'United Kingdom',
    });
    const dubai = course({
      sourceRef: 'bham|b',
      institutionRef: 'university-of-birmingham',
      institutionName: 'University of Birmingham',
      country: 'United Arab Emirates',
    });

    const { institutions, keyBySourceRef } = groupByInstitutionAndCountry([dubai, uk], new Map(), ours);

    expect([...institutions.keys()].sort()).toEqual([
      'university-of-birmingham|AE',
      'university-of-birmingham|GB',
    ]);
    expect(keyBySourceRef.get('bham|a')).toBe('university-of-birmingham|GB');
    expect(keyBySourceRef.get('bham|b')).toBe('university-of-birmingham|AE');
  });

  it('places a course by the country it was fetched under when the spelling differs from ours', () => {
    const nl = course({ sourceRef: 'w|a', institutionRef: 'wittenborg', country: 'Netherlands' });

    const { keyBySourceRef } = groupByInstitutionAndCountry([nl], new Map([['w|a', 'NL']]), ours);

    expect(keyBySourceRef.get('w|a')).toBe('wittenborg|NL');
  });

  it('leaves out a course it cannot place rather than guessing a country', () => {
    const ge = course({ sourceRef: 'nv|a', institutionRef: 'new-vision-university', country: 'Georgia' });

    const { institutions, keyBySourceRef, unplaced } = groupByInstitutionAndCountry([ge], new Map(), ours);

    expect(institutions.size).toBe(0);
    expect(keyBySourceRef.has('nv|a')).toBe(false);
    expect(unplaced.get('new-vision-university')).toBe('Georgia');
  });
});

describe('institutionAlias', () => {
  it('names our record for a hand-checked institution', () => {
    expect(institutionAlias('berlin-school-of-business-and-innovation', 'DE')).toBe(
      'Berlin School of Business and Innovation GmbH',
    );
  });

  it('does not stretch an alias to a campus in another country', () => {
    // BSBI also teaches in Spain and France; those campuses are not its Berlin record.
    expect(institutionAlias('berlin-school-of-business-and-innovation', 'ES')).toBeUndefined();
  });

  it('follows a verified rename to our record, in that record\'s country only', () => {
    // Renamed University of Europe for Applied Sciences in October 2020; the
    // Dubai campus is a separate place, not the German record.
    expect(institutionAlias('university-of-europe-for-applied-sciences', 'DE')).toBe(
      'University of Applied Sciences Europe',
    );
    expect(institutionAlias('university-of-europe-for-applied-sciences', 'AE')).toBeUndefined();
  });
});

describe('indexInstitutions', () => {
  const index = indexInstitutions([
    { id: '1', slug: 'franklin-college', name: 'Franklin College', aka: ['Franklin College of Indiana'], countryCode: 'US' },
    { id: '2', slug: 'university-of-georgia', name: 'University of Georgia', aka: ['Franklin College', 'UGA'], countryCode: 'US' },
    { id: '3', slug: 'wittenborg-university', name: 'Wittenborg University', aka: [], countryCode: 'NL' },
    { id: '4', slug: 'twin-a', name: 'Twin College', aka: [], countryCode: 'GB' },
    { id: '5', slug: 'twin-b', name: 'Twin College', aka: [], countryCode: 'GB' },
  ]);

  it('prefers the institution called the name over one that only lists it as an alias', () => {
    // Treating both as equal made Franklin College ambiguous and dropped its courses.
    expect(index.exact('US', 'Franklin College')).toMatchObject({ id: '1' });
  });

  it('still finds an institution by its alias when none is called that', () => {
    expect(index.exact('US', 'UGA')).toMatchObject({ id: '2' });
  });

  it('reports two institutions with the same name as ambiguous rather than picking one', () => {
    expect(index.exact('GB', 'Twin College')).toBe('ambiguous');
  });

  it('never matches across countries', () => {
    expect(index.exact('GB', 'Franklin College')).toBeUndefined();
  });

  it('matches a relabelled name by its distinctive part', () => {
    expect(index.byDistinctiveName('NL', 'Wittenborg - University of Applied Sciences')).toMatchObject({ id: '3' });
  });
});

