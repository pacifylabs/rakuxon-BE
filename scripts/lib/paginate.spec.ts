import { paginate } from './paginate';
import type { PaginateOptions } from './paginate';

/**
 * A model of the real feed, as measured: it skips page × limit rows, returns
 * at most `cap` rows per page, and can blank chosen pages to mimic a blip.
 * `cached` marks pages served from the local cache rather than the network.
 */
function model(count: number, opts: { cap?: number; blank?: number[]; cached?: number[] }) {
  const requested: [number, number][] = [];
  const fetchPage: PaginateOptions<string>['fetchPage'] = async (index, limit) => {
    requested.push([index, limit]);
    const skip = index * limit;
    const size = Math.max(0, Math.min(limit, opts.cap ?? Infinity, count - skip));
    const items = opts.blank?.includes(index)
      ? []
      : Array.from({ length: size }, (_, i) => `row-${skip + i}`);
    return { page: { count, items }, fromNetwork: !opts.cached?.includes(index) };
  };
  return { fetchPage, requested };
}

async function run(
  count: number,
  modelOpts: { cap?: number; blank?: number[]; cached?: number[] } = {},
  overrides: Partial<PaginateOptions<string>> = {},
) {
  const { fetchPage, requested } = model(count, modelOpts);
  const lines: string[] = [];
  let pauses = 0;

  const result = await paginate<string>({
    pageSize: 100,
    startPage: 0,
    maxConsecutiveEmpty: 3,
    fetchPage,
    pause: async () => {
      pauses += 1;
    },
    log: (line) => lines.push(line),
    ...overrides,
  });

  return { result, pages: requested.map(([index]) => index), requested, lines, pauses };
}

const rows = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => `row-${from + i}`);

describe('paginate', () => {
  it('steps one page at a time, because the feed multiplies offset by limit', async () => {
    // The first importer stepped by 100 and read rows 0, 10,000, 20,000,
    // 30,000 and 40,000, then asked for row 50,000 and called the empty
    // answer a limit.
    const { result, pages } = await run(40_461);

    expect(pages).toHaveLength(405);
    expect(pages.slice(0, 3)).toEqual([0, 1, 2]);
    expect(pages[pages.length - 1]).toBe(404);
    expect(result.items).toHaveLength(40_461);
    expect(new Set(result.items).size).toBe(40_461);
    expect(result.stoppedEarly).toBe(false);
  });

  it('reads the short last page', async () => {
    const { result, pages } = await run(250);

    expect(pages).toEqual([0, 1, 2]);
    expect(result.items).toEqual(rows(0, 250));
  });

  it('does not take one empty page as the end of the data', async () => {
    const { result, pages } = await run(400, { blank: [1] });

    expect(pages).toEqual([0, 1, 2, 3]);
    expect(result.items).toEqual([...rows(0, 100), ...rows(200, 400)]);
    expect(result.emptyPages).toEqual([1]);
    expect(result.stoppedEarly).toBe(false);
  });

  it('stops after consecutive empty pages and says where', async () => {
    const { result, pages, lines } = await run(1_000, { blank: [3, 4, 5, 6] });

    expect(pages).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.items).toEqual(rows(0, 300));
    expect(result.stoppedEarly).toBe(true);
    expect(lines.join('\n')).toContain('pages 3, 4, 5 (from row 300)');
  });

  it('starts from the given page', async () => {
    const { result, pages } = await run(400, {}, { startPage: 2 });

    expect(pages).toEqual([2, 3]);
    expect(result.items).toEqual(rows(200, 400));
  });

  it('adopts a server page-size cap without skipping or repeating rows', async () => {
    const { result, requested } = await run(300, { cap: 50 });

    expect(requested[0]).toEqual([0, 100]);
    expect(requested.slice(1).every(([, limit]) => limit === 50)).toBe(true);
    expect(result.items).toEqual(rows(0, 300));
  });

  it('refuses to guess when a cap appears part-way through a resumed run', async () => {
    // Re-aligning page × limit after a size change mid-run would silently
    // skip or repeat rows, so it stops and says how to re-run instead.
    await expect(run(1_000, { cap: 50 }, { startPage: 3 })).rejects.toThrow('--page-size=50');
  });

  it('pauses after network requests only', async () => {
    const { pauses } = await run(300, { cached: [0, 2] });

    expect(pauses).toBe(1);
  });

  it('ends cleanly on a feed that reports nothing', async () => {
    const { result, pages } = await run(0);

    expect(pages).toEqual([0]);
    expect(result.items).toEqual([]);
    expect(result.stoppedEarly).toBe(false);
  });
});
