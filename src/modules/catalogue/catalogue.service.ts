import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';

import { PublishStatus } from '../../contract/enums';
import { Article } from './entities/article.entity';
import { Country } from './entities/country.entity';
import { Course } from './entities/course.entity';
import { Institution } from './entities/institution.entity';
import type {
  CountryCountDto,
  CountryDto,
  InstitutionListDto,
  InstitutionSummaryDto,
  ListInstitutionsQueryDto,
} from './dto/institution.dto';
import type {
  CourseDetailDto,
  CourseListDto,
  CourseSummaryDto,
  ListCoursesQueryDto,
} from './dto/course.dto';
import type {
  ArticleDetailDto,
  ArticleListDto,
  ArticleSummaryDto,
  ListArticlesQueryDto,
} from './dto/article.dto';
import type { HighlightSegmentDto, SearchResponseDto, SearchResultDto } from './dto/search.dto';

/** Below this, a query matches most of the catalogue and ranks nothing. */
const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 7;

interface SearchRow {
  type: SearchResultDto['type'];
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  countryCode: string | null;
  rank: number;
}

@Injectable()
export class CatalogueService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Institution) private readonly institutions: Repository<Institution>,
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    @InjectRepository(Article) private readonly articles: Repository<Article>,
    @InjectRepository(Country) private readonly countryRepo: Repository<Country>,
  ) {}

  /**
   * The full reference list, for a profile or address form's dropdown — as
   * opposed to `countries()`, which only lists destinations with a published
   * university behind them.
   */
  async referenceCountries(): Promise<CountryDto[]> {
    const rows = await this.countryRepo.find({ order: { name: 'ASC' } });
    return rows.map((row) => ({
      code: row.code,
      name: row.name,
      isDestination: row.isDestination,
      flagEmoji: row.flagEmoji,
    }));
  }

  /**
   * The country menu.
   *
   * Counts come from the same published set the listing uses, so a country
   * cannot advertise 456 universities and then show an empty page — which is
   * what happens when a menu is hard-coded beside a filtered list.
   */
  async countries(): Promise<CountryCountDto[]> {
    const rows = (await this.institutions
      .createQueryBuilder('i')
      .select('i.countryCode', 'countryCode')
      .addSelect('MIN(i.country)', 'country')
      .addSelect('COUNT(*)::int', 'institutions')
      .where('i.status = :status', { status: PublishStatus.Published })
      .groupBy('i.countryCode')
      .orderBy('MIN(i.country)', 'ASC')
      .getRawMany()) as CountryCountDto[];

    return rows;
  }

  async listInstitutions(query: ListInstitutionsQueryDto): Promise<InstitutionListDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;

    const builder = this.institutions
      .createQueryBuilder('i')
      .where('i.status = :status', { status: PublishStatus.Published });

    if (query.country) builder.andWhere('i.countryCode = :country', { country: query.country });

    if (query.q?.trim()) {
      const term = `%${query.q.trim()}%`;
      /*
       * ILIKE over name, city and the acronym array rather than the tsvector:
       * this is a browse filter, not a typeahead, so a partial word has to
       * match anywhere in the string — "chester" should find Manchester.
       */
      builder.andWhere(
        new Brackets((where) => {
          where
            .where('i.name ILIKE :term', { term })
            .orWhere('i.city ILIKE :term', { term })
            .orWhere('array_to_string(i.aka, \' \') ILIKE :term', { term });
        }),
      );
    }

    builder
      .orderBy(query.sort === 'city' ? 'i.city' : 'i.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await builder.getManyAndCount();

    /*
     * Course counts in one grouped query rather than one per institution.
     * Twenty-four extra round trips per page is how a listing gets slow
     * without anyone noticing which line did it.
     */
    const counts = new Map<string, number>();
    if (rows.length > 0) {
      const raw = (await this.dataSource.query(
        `SELECT "institutionId", count(*)::int AS n FROM courses
         WHERE status = $1 AND "institutionId" = ANY($2::uuid[])
         GROUP BY "institutionId"`,
        [PublishStatus.Published, rows.map((row) => row.id)],
      )) as { institutionId: string; n: number }[];

      for (const row of raw) counts.set(row.institutionId, row.n);
    }

    return {
      items: rows.map((row) => this.toSummary(row, counts.get(row.id) ?? 0)),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Published courses at published institutions, joined so a card can render
   * without a second query per row.
   */
  async listCourses(query: ListCoursesQueryDto): Promise<CourseListDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;

    const builder = this.courses
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.institution', 'i')
      .where('c.status = :status', { status: PublishStatus.Published })
      .andWhere('i.status = :status', { status: PublishStatus.Published });

    if (query.country) builder.andWhere('i.countryCode = :country', { country: query.country });
    if (query.institutionSlug) {
      builder.andWhere('i.slug = :slug', { slug: query.institutionSlug });
    }
    if (query.level) builder.andWhere('c.level = :level', { level: query.level });
    if (query.discipline) {
      builder.andWhere('EXISTS (SELECT 1 FROM unnest(c.disciplines) AS d WHERE d ILIKE :discTerm)', {
        discTerm: `%${query.discipline}%`,
      });
    }

    if (query.q?.trim()) {
      const term = `%${query.q.trim()}%`;
      builder.andWhere(
        new Brackets((where) => {
          where.where('c.title ILIKE :term', { term }).orWhere('i.name ILIKE :term', { term });
        }),
      );
    }

    builder
      .orderBy('c.title', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await builder.getManyAndCount();

    return {
      items: rows.map((row) => this.toCourseSummary(row)),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async institutionBySlug(slug: string): Promise<Institution & { courseCount: number }> {
    const found = await this.institutions.findOne({
      where: { slug, status: PublishStatus.Published },
    });

    /* 404 rather than 403 for an unpublished record: whether a draft exists is
       not something an anonymous visitor should be able to probe for. */
    if (!found) throw new NotFoundException('No such university.');

    /* Published courses only, so the count agrees with the list it sits above. */
    const courseCount = await this.courses.count({
      where: { institutionId: found.id, status: PublishStatus.Published },
    });

    return { ...found, highlights: this.highlightsFor(found), courseCount };
  }

  /**
   * The "Highlights" strip, derived rather than written.
   *
   * Every line is a fact already in the row, phrased. Nothing here is a claim
   * we could not point at a source for — no "world-class facilities", no
   * "vibrant student community", because we have no basis for either and a
   * page full of them is how a catalogue stops being worth reading.
   *
   * Editor-written highlights win where they exist; this only fills the gap
   * left by six thousand imported records that have none.
   */
  private highlightsFor(row: Institution): string[] {
    if (row.highlights.length > 0) return row.highlights;

    const lines: string[] = [];

    for (const body of row.memberships) lines.push(`Member of the ${body}`);

    if (row.foundedYear) {
      const age = new Date().getFullYear() - row.foundedYear;
      lines.push(`Founded in ${row.foundedYear}, teaching for over ${age} years`);
    }

    if (row.studentCount) {
      lines.push(`Around ${row.studentCount.toLocaleString('en-GB')} students enrolled`);
    }

    if (row.city) lines.push(`Based in ${row.city}, ${row.country}`);
    if (row.motto) lines.push(`Motto: “${row.motto}”`);

    return lines;
  }

  /**
   * The guidance listing.
   *
   * Ordered newest first, with rows that have no publish date last rather than
   * first — Postgres sorts NULLs first on DESC, which would put every undated
   * draft-turned-published article above this month's writing.
   */
  async listArticles(query: ListArticlesQueryDto): Promise<ArticleListDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;

    const builder = this.articles
      .createQueryBuilder('a')
      .where('a.status = :status', { status: PublishStatus.Published });

    if (query.country) builder.andWhere('a.countryCode = :country', { country: query.country });
    /* Array containment, not ILIKE over a joined string: "visa" must not match
       the tag "visa-refusal-appeals" and quietly widen the filter. */
    if (query.tag) builder.andWhere('a.tags @> ARRAY[:tag]::text[]', { tag: query.tag });

    builder
      .orderBy('a.publishedAt', 'DESC', 'NULLS LAST')
      .addOrderBy('a.title', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await builder.getManyAndCount();

    /*
     * The tag list comes from the whole published set, not this page: a filter
     * bar built from the twelve visible rows loses options as you paginate,
     * and offers none at all once a filter has narrowed the page to one.
     */
    const tagRows = (await this.articles
      .createQueryBuilder('a')
      .select('DISTINCT unnest(a.tags)', 'tag')
      .where('a.status = :status', { status: PublishStatus.Published })
      .orderBy('tag', 'ASC')
      .getRawMany()) as { tag: string }[];

    return {
      items: rows.map((row) => this.toArticleSummary(row)),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / limit)),
      tags: tagRows.map((row) => row.tag),
    };
  }

  async articleBySlug(slug: string): Promise<ArticleDetailDto> {
    const found = await this.articles.findOne({
      where: { slug, status: PublishStatus.Published },
    });

    if (!found) throw new NotFoundException('No such article.');

    return {
      ...this.toArticleSummary(found),
      body: found.body,
      source: found.source ?? undefined,
      sourceUrl: found.sourceUrl ?? undefined,
    };
  }

  private toArticleSummary(row: Article): ArticleSummaryDto {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt ?? undefined,
      heroImageUrl: row.heroImageUrl ?? undefined,
      countryCode: row.countryCode ?? undefined,
      tags: row.tags,
      readMinutes: row.readMinutes ?? undefined,
      author: row.author ?? undefined,
      publishedAt: row.publishedAt?.toISOString(),
    };
  }

  private toSummary(row: Institution, courseCount: number): InstitutionSummaryDto {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      aka: row.aka,
      country: row.country,
      countryCode: row.countryCode,
      city: row.city ?? undefined,
      website: row.website ?? undefined,
      logoUrl: row.logoUrl ?? undefined,
      fastTrackOffer: row.fastTrackOffer,
      courseCount,
    };
  }

  /**
   * One course, with its university.
   *
   * A course at an unpublished university is as unpublished as its host, and
   * 404s for the same reason the university would.
   */
  async courseBySlug(slug: string): Promise<CourseDetailDto> {
    const found = await this.courses.findOne({
      where: { slug, status: PublishStatus.Published, institution: { status: PublishStatus.Published } },
      relations: { institution: true },
    });
    if (!found?.institution) throw new NotFoundException('No such course.');

    return {
      ...this.toCourseSummary(found),
      overview: found.overview ?? undefined,
      highlights: found.highlights,
      careers: found.careers ?? undefined,
      campus: found.campus ?? undefined,
      tuitionPeriod: found.tuitionPeriod,
      entryRequirements: found.entryRequirements,
      englishTests: found.englishTests,
      scholarships: found.scholarships,
      offerResponseWeeks: found.offerResponseWeeks ?? undefined,
    };
  }

  private toCourseSummary(row: Course): CourseSummaryDto {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      level: row.level,
      studyMode: row.studyMode,
      disciplines: row.disciplines,
      durationMonths: row.durationMonths ?? undefined,
      tuitionAmount: row.tuitionAmount ?? undefined,
      tuitionCurrency: row.tuitionCurrency ?? undefined,
      tuitionIsEstimate: row.tuitionIsEstimate,
      fastTrackOffer: row.fastTrackOffer,
      intakes: row.intakes,
      institutionId: row.institution!.id,
      institutionName: row.institution!.name,
      institutionSlug: row.institution!.slug,
      country: row.institution!.country,
      countryCode: row.institution!.countryCode,
    };
  }

  /**
   * One ranked list across universities, courses and articles.
   *
   * A single UNION query rather than three round trips: ranking only means
   * something if the candidates are compared against each other, and merging
   * three separately-limited lists in JavaScript would drop a strong course
   * match to make room for a weak article.
   *
   * Two matching strategies, because they fail in opposite directions.
   * Full-text handles words, stems and the abbreviations in `aka` — but only
   * whole tokens, so a half-typed word finds nothing, which is exactly what a
   * typeahead sends. Trigram similarity handles partial words and typos but
   * has no idea about stems. Together they cover what someone actually types.
   */
  async search(query: string, limit = DEFAULT_LIMIT): Promise<SearchResponseDto> {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) return { items: [], total: 0 };

    /*
     * to_tsquery with :* for prefix matching, built from the words rather than
     * passed through plainto_tsquery — that one has no prefix mode, so "univ"
     * would match nothing until the word was finished.
     */
    const prefixQuery = trimmed
      .split(/\s+/)
      .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter(Boolean)
      .map((word) => `${word}:*`)
      .join(' & ');

    if (!prefixQuery) return { items: [], total: 0 };

    const rows = (await this.dataSource.query(SEARCH_SQL, [
      prefixQuery,
      trimmed,
      PublishStatus.Published,
      limit,
    ])) as SearchRow[];

    const [{ total }] = (await this.dataSource.query(COUNT_SQL, [
      prefixQuery,
      trimmed,
      PublishStatus.Published,
    ])) as [{ total: string }];

    return {
      items: rows.map((row) => ({
        type: row.type,
        id: row.id,
        slug: row.slug,
        name: row.name,
        subtitle: row.subtitle ?? undefined,
        countryCode: row.countryCode ?? undefined,
        highlight: highlight(row.name, trimmed),
      })),
      total: Number(total),
    };
  }
}

/**
 * Splits a name into matched and unmatched runs.
 *
 * Done here rather than with ts_headline, which returns a marked-up string:
 * that would make every consumer render the field as HTML, and a name
 * containing a tag becomes stored XSS the moment one of them forgets to
 * escape. Matching each query word independently also means "man chest"
 * highlights both parts of "Manchester", which is what the visitor typed.
 */
export function highlight(name: string, query: string): HighlightSegmentDto[] {
  const words = query
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);

  if (words.length === 0) return [{ text: name, match: false }];

  const pattern = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'giu');
  const segments: HighlightSegmentDto[] = [];
  let cursor = 0;

  for (const found of name.matchAll(pattern)) {
    const start = found.index;
    if (start > cursor) segments.push({ text: name.slice(cursor, start), match: false });
    segments.push({ text: found[0], match: true });
    cursor = start + found[0].length;
  }

  if (cursor < name.length) segments.push({ text: name.slice(cursor), match: false });

  return segments.length > 0 ? segments : [{ text: name, match: false }];
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/*
 * $1 prefix tsquery, $2 raw query for trigram, $3 published status, $4 limit.
 *
 * Ranking is built from three terms, in descending order of how much they mean:
 *
 * 1. A flat bonus for matching the full-text query at all. This exists because
 *    the two signals are on incompatible scales — ts_rank returns roughly
 *    0.0-0.1, word_similarity returns 0.0-1.0 — so summing them raw let every
 *    fuzzy near-match outrank every exact one. Searching "visa" returned five
 *    institutions with "Vista" in the name and buried the visa guidance, which
 *    is the whole reason this is written out rather than added together.
 * 2. ts_rank itself, scaled up, to order the rows that did match.
 * 3. Trigram similarity, weighted below both, so it decides ties and still
 *    catches the typo or half-typed word that full-text cannot.
 *
 * Institutions are nudged above courses at equal rank: someone typing a
 * university's name wants the university, not four of its own courses stacked
 * on top of it. A flat bonus again, because a multiplier on a number that
 * small was not a nudge at all.
 */
const MATCHED_ROWS = `
  SELECT 'institution' AS type, i.id::text, i.slug::text, i.name,
         NULLIF(concat_ws(', ', i.city, i.country), '') AS subtitle,
         i."countryCode",
         (i."searchVector" @@ to_tsquery('english', $1))::int
           + ts_rank(i."searchVector", to_tsquery('english', $1)) * 4
           + word_similarity($2, i.name) * 0.6
           + 0.15 AS rank
  FROM institutions i
  WHERE i.status = $3
    AND (i."searchVector" @@ to_tsquery('english', $1) OR $2 <% i.name)

  UNION ALL

  SELECT 'course', c.id::text, c.slug::text, c.title,
         NULLIF(concat_ws(', ', inst.name, inst.country), ''),
         inst."countryCode",
         (c."searchVector" @@ to_tsquery('english', $1))::int
           + ts_rank(c."searchVector", to_tsquery('english', $1)) * 4
           + word_similarity($2, c.title) * 0.6
           + 0.05
  FROM courses c
  JOIN institutions inst ON inst.id = c."institutionId"
  WHERE c.status = $3
    AND (c."searchVector" @@ to_tsquery('english', $1) OR $2 <% c.title)

  UNION ALL

  SELECT 'article', a.id::text, a.slug::text, a.title,
         a.excerpt, a."countryCode",
         (a."searchVector" @@ to_tsquery('english', $1))::int
           + ts_rank(a."searchVector", to_tsquery('english', $1)) * 4
           + word_similarity($2, a.title) * 0.6
  FROM articles a
  WHERE a.status = $3
    AND (a."searchVector" @@ to_tsquery('english', $1) OR $2 <% a.title)
`;

const SEARCH_SQL = `
  SELECT * FROM (${MATCHED_ROWS}) AS matches
  ORDER BY rank DESC, name ASC
  LIMIT $4
`;

const COUNT_SQL = `SELECT count(*)::text AS total FROM (${MATCHED_ROWS}) AS matches`;
