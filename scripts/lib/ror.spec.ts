import { primaryLocation } from './ror';
import type { RorLocatable } from './ror';

describe('primaryLocation', () => {
  it('picks the only location when there is just one', () => {
    const org: RorLocatable = {
      locations: [{ geonames_details: { country_code: 'GB', country_name: 'United Kingdom', name: 'Leeds' } }],
    };

    expect(primaryLocation(org, ['GB'])).toEqual({
      country_code: 'GB',
      country_name: 'United Kingdom',
      name: 'Leeds',
    });
  });

  it('prefers the location matching the batch over locations[0], when the first is a different country', () => {
    // This is the bug: a branch campus or headquarters listed first used to
    // become the institution's recorded country even when the batch was
    // searching for, and matched on, a different one of its locations.
    const org: RorLocatable = {
      locations: [
        { geonames_details: { country_code: 'US', country_name: 'United States', name: 'Boston' } },
        { geonames_details: { country_code: 'GB', country_name: 'United Kingdom', name: 'Oxford' } },
      ],
    };

    expect(primaryLocation(org, ['GB'])?.country_code).toBe('GB');
  });

  it('matches case-insensitively against the requested country codes', () => {
    const org: RorLocatable = {
      locations: [{ geonames_details: { country_code: 'gb', country_name: 'United Kingdom', name: 'Leeds' } }],
    };

    expect(primaryLocation(org, ['GB'])?.country_code).toBe('gb');
  });

  it('falls back to locations[0] when none of the locations match the batch', () => {
    // Should not happen given ROR's own search filter, but must not throw.
    const org: RorLocatable = {
      locations: [
        { geonames_details: { country_code: 'FR', country_name: 'France', name: 'Paris' } },
        { geonames_details: { country_code: 'DE', country_name: 'Germany', name: 'Berlin' } },
      ],
    };

    expect(primaryLocation(org, ['GB'])?.country_code).toBe('FR');
  });

  it('returns undefined for an organisation with no locations at all', () => {
    expect(primaryLocation({}, ['GB'])).toBeUndefined();
  });
});
