/**
 * Paging for a feed whose `offset` is a page number, not a row count.
 *
 * Measured against Edvoy, not assumed: offset=404&limit=100 returns exactly the
 * last 61 of 40,461 rows, offset=405 returns none, and offset=499&limit=1
 * returns row 499 — the server skips offset × limit rows. The first importer
 * stepped offset by 100 as if it were a row count, so it read rows 0, 10,000,
 * 20,000, 30,000 and 40,000, then asked for "offset 500" (row 50,000), got
 * nothing, and reported that as a paging limit that never existed.
 *
 * An empty page before the end is still treated with suspicion rather than as
 * the end: the following pages are asked for, and only several empties in a
 * row conclude the run.
 */

export interface FeedPage<T> {
  count: number;
  items: T[];
}

export interface PaginateOptions<T> {
  pageSize: number;
  /** Page index to begin at; 0 is the start. */
  startPage: number;
  /** Empty pages in a row before concluding the feed will not go further. */
  maxConsecutiveEmpty: number;
  /** Fetch page `index` (0-based) of `limit` rows. */
  fetchPage: (index: number, limit: number) => Promise<{ page: FeedPage<T>; fromNetwork: boolean }>;
  /** Called after every network request, so consecutive requests are spaced. */
  pause: () => Promise<void>;
  log: (line: string) => void;
}

export interface PaginateResult<T> {
  items: T[];
  reported: number;
  pageSize: number;
  /** Page indices that came back empty. */
  emptyPages: number[];
  /** Ended on consecutive empty pages rather than by reaching the reported total. */
  stoppedEarly: boolean;
}

export async function paginate<T>(options: PaginateOptions<T>): Promise<PaginateResult<T>> {
  const items: T[] = [];
  const emptyPages: number[] = [];
  let pageSize = options.pageSize;
  let reported: number | undefined;
  let consecutiveEmpty = 0;
  let stoppedEarly = false;
  let fetched = 0;

  for (
    let index = options.startPage;
    reported === undefined || index * pageSize < reported;
    index += 1
  ) {
    const { page, fromNetwork } = await options.fetchPage(index, pageSize);
    fetched += 1;
    if (fromNetwork) await options.pause();

    if (reported === undefined) {
      reported = page.count;
      options.log(`${reported.toLocaleString('en-GB')} rows reported`);

      const short =
        page.items.length > 0 &&
        page.items.length < pageSize &&
        index * pageSize + page.items.length < reported;

      if (short) {
        /* The server skips page × limit rows, so changing the page size is only
           safe from the very first page. Anywhere else the next page would
           start in the wrong place and silently skip or repeat rows. */
        if (index !== 0) {
          throw new Error(
            `Server returned ${page.items.length} rows for a page of ${pageSize} part-way through; ` +
              `re-run with --page-size=${page.items.length}.`,
          );
        }
        pageSize = page.items.length;
        options.log(`Server caps pages at ${pageSize}; using that.`);
      }
    }

    if (page.items.length === 0) {
      emptyPages.push(index);
      consecutiveEmpty += 1;

      if (consecutiveEmpty >= options.maxConsecutiveEmpty) {
        stoppedEarly = true;
        options.log(
          `Feed returned nothing for pages ${emptyPages.slice(-consecutiveEmpty).join(', ')} ` +
            `(from row ${((index - consecutiveEmpty + 1) * pageSize).toLocaleString('en-GB')}) ` +
            `of ${reported.toLocaleString('en-GB')} reported. Stopping rather than guessing.`,
        );
        break;
      }

      options.log(`  page ${index}: empty; trying the next page before concluding.`);
      continue;
    }

    consecutiveEmpty = 0;
    items.push(...page.items);

    if (fetched % 20 === 0) {
      options.log(
        `  ${Math.min((index + 1) * pageSize, reported).toLocaleString('en-GB')}/${reported.toLocaleString('en-GB')}`,
      );
    }
  }

  return { items, reported: reported ?? 0, pageSize, emptyPages, stoppedEarly };
}
