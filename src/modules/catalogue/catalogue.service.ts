import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { PublishStatus } from '../../contract/enums';
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
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

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
