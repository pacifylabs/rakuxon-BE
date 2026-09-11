import { definedEntries } from './defined-entries';

describe('definedEntries', () => {
  it('drops keys whose value is undefined', () => {
    expect(definedEntries({ a: 1, b: undefined, c: 'x' })).toEqual({ a: 1, c: 'x' });
  });

  it('keeps a key whose value is null, false, 0 or empty string — only undefined means "not sent"', () => {
    expect(definedEntries({ a: null, b: false, c: 0, d: '' })).toEqual({
      a: null,
      b: false,
      c: 0,
      d: '',
    });
  });

  it('returns an empty object when every value is undefined', () => {
    expect(definedEntries({ a: undefined, b: undefined })).toEqual({});
  });
});
