import { checkLocation } from './location-check';

describe('checkLocation', () => {
  it('returns null when Wikidata and the stored row already agree', () => {
    const current = { countryCode: 'GB', country: 'United Kingdom' };
    const wikidata = { countryCode: 'GB', countryName: 'United Kingdom' };

    expect(checkLocation(current, wikidata)).toBeNull();
  });

  it('returns the correction when they disagree', () => {
    const current = { countryCode: 'GB', country: 'United Kingdom' };
    const wikidata = { countryCode: 'US', countryName: 'United States of America' };

    expect(checkLocation(current, wikidata)).toEqual({
      countryCode: 'US',
      country: 'United States of America',
    });
  });

  it('is case-insensitive when comparing the stored code against Wikidata\'s', () => {
    const current = { countryCode: 'gb', country: 'United Kingdom' };
    const wikidata = { countryCode: 'GB', countryName: 'United Kingdom' };

    expect(checkLocation(current, wikidata)).toBeNull();
  });

  it('returns null — not a guess — when Wikidata has no country claim at all', () => {
    const current = { countryCode: 'GB', country: 'United Kingdom' };
    const wikidata = { countryCode: null, countryName: null };

    expect(checkLocation(current, wikidata)).toBeNull();
  });

  it('falls back to the ISO code as the country name if Wikidata has a code but no label', () => {
    const current = { countryCode: 'GB', country: 'United Kingdom' };
    const wikidata = { countryCode: 'US', countryName: null };

    expect(checkLocation(current, wikidata)).toEqual({ countryCode: 'US', country: 'US' });
  });
});
