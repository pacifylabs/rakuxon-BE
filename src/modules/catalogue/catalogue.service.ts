import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';

import { PublishStatus } from '../../contract/enums';
import { Institution } from './entities/institution.entity';
import type {
  CountryCountDto,
  InstitutionListDto,
  InstitutionSummaryDto,
  ListInstitutionsQueryDto,
} from './dto/institution.dto';
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
  ) {}

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

  async institutionBySlug(slug: string): Promise<Institution> {
    const found = await this.institutions.findOne({
      where: { slug, status: PublishStatus.Published },
    });

    /* 404 rather than 403 for an unpublished record: whether a draft exists is
       not something an anonymous visitor should be able to probe for. */
    if (!found) throw new NotFoundException('No such university.');

    return found;
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
 * Institutions are nudged above courses at equal rank: someone typing a
 * university's name wants the university, not four of its own courses stacked
 * on top of it.
 */
const MATCHED_ROWS = `
  SELECT 'institution' AS type, i.id::text, i.slug::text, i.name,
         NULLIF(concat_ws(', ', i.city, i.country), '') AS subtitle,
         i."countryCode",
         ts_rank(i."searchVector", to_tsquery('english', $1)) * 1.5
           + word_similarity($2, i.name) AS rank
  FROM institutions i
  WHERE i.status = $3
    AND (i."searchVector" @@ to_tsquery('english', $1) OR $2 <% i.name)

  UNION ALL

  SELECT 'course', c.id::text, c.slug::text, c.title,
         NULLIF(concat_ws(', ', inst.name, inst.country), ''),
         inst."countryCode",
         ts_rank(c."searchVector", to_tsquery('english', $1))
           + word_similarity($2, c.title)
  FROM courses c
  JOIN institutions inst ON inst.id = c."institutionId"
  WHERE c.status = $3
    AND (c."searchVector" @@ to_tsquery('english', $1) OR $2 <% c.title)

  UNION ALL

  SELECT 'article', a.id::text, a.slug::text, a.title,
         a.excerpt, a."countryCode",
         ts_rank(a."searchVector", to_tsquery('english', $1)) * 0.8
           + word_similarity($2, a.title)
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
