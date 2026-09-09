import { highlight } from './catalogue.service';

/**
 * Highlighting is returned as segments rather than marked-up HTML, so these
 * assert the shape a client can render without escaping anything.
 */
describe('highlight', () => {
  it('splits a name around the match', () => {
    expect(highlight('University of Manchester', 'un')).toEqual([
      { text: 'Un', match: true },
      { text: 'iversity of Manchester', match: false },
    ]);
  });

  it('preserves the original casing rather than the query casing', () => {
    // Showing what the visitor typed, rather than what the record says, makes
    // the result look like a different record.
    const [first] = highlight('University of Manchester', 'UNIV');
    expect(first).toEqual({ text: 'Univ', match: true });
  });

  it('marks every word of a multi-word query', () => {
    const segments = highlight('MSc Data Science', 'data science');
    expect(segments.filter((segment) => segment.match).map((segment) => segment.text)).toEqual([
      'Data',
      'Science',
    ]);
  });

  it('returns the whole name unmatched when nothing matches', () => {
    expect(highlight('University of Toronto', 'zzz')).toEqual([
      { text: 'University of Toronto', match: false },
    ]);
  });

  it('never emits markup, so a name containing a tag cannot execute', () => {
    // ts_headline would return "<em>..</em>" and force every consumer to render
    // the field as HTML; an imported name carrying a tag then becomes stored
    // XSS the first time one of them forgets to escape it.
    const segments = highlight('<script>alert(1)</script> College', 'script');

    expect(segments.map((segment) => segment.text).join('')).toBe(
      '<script>alert(1)</script> College',
    );
    for (const segment of segments) expect(segment.text).not.toContain('<em>');
  });

  it('treats regex characters in the query as literal text', () => {
    // "C++" reaching a RegExp unescaped throws, which would take the whole
    // search down for one query.
    expect(() => highlight('C++ Programming', 'C++')).not.toThrow();
    expect(highlight('C++ Programming', 'C++')[0]).toEqual({ text: 'C', match: true });
  });

  it('handles an empty query without marking anything', () => {
    expect(highlight('Anything', '   ')).toEqual([{ text: 'Anything', match: false }]);
  });
});
