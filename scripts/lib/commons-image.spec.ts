import { commonsFileName, commonsThumb, heroImageFrom, isInstitutionMark } from './commons-image';

const filePath = (file: string) => `http://commons.wikimedia.org/wiki/Special:FilePath/${file}`;

describe('commonsThumb', () => {
  it('upgrades the scheme and asks for the size the page renders', () => {
    expect(commonsThumb(filePath('Cardiff.jpg'), 1200)).toBe(
      'https://commons.wikimedia.org/wiki/Special:FilePath/Cardiff.jpg?width=1200',
    );
  });

  it('leaves a URL it cannot resize alone apart from the scheme', () => {
    expect(commonsThumb('http://example.org/photo.jpg')).toBe('https://example.org/photo.jpg');
  });
});

describe('commonsFileName', () => {
  it('decodes the file name', () => {
    expect(commonsFileName(filePath('ATSU%20logo.svg'))).toBe('ATSU logo.svg');
  });

  it('has no file name for a URL from anywhere else', () => {
    expect(commonsFileName('https://cdn.rakuxon.com/cardiff.jpg')).toBeNull();
  });
});

describe('isInstitutionMark', () => {
  it.each([
    'ATSU logo.svg',
    'KCLogo.png',
    'Seal of Harvard University.svg',
    'UNIA wordmark.SVG',
    /* Five words, so the name is long — but it leads with what the file is. */
    'Coat of arms of Keele.png',
  ])('treats %s as a mark', (file) => {
    expect(isInstitutionMark(file)).toBe(true);
  });

  it.each([
    'Dartmouth College campus 2007-06-23 Dartmouth Hall 02.JPG',
    'Cranfield University entrance Main reception and logo.jpg',
    'Rectorado UNIA.jpg',
  ])('treats %s as a photograph', (file) => {
    expect(isInstitutionMark(file)).toBe(false);
  });
});

describe('heroImageFrom', () => {
  it('stores nothing rather than a trademark the page may not publish', () => {
    // A.T. Still University's only Wikidata image is its wordmark.
    expect(heroImageFrom(filePath('ATSU%20logo.svg'))).toBeNull();
  });

  it('stores a campus photograph at the banner width', () => {
    expect(heroImageFrom(filePath('Cardiff.jpg'))).toBe(
      'https://commons.wikimedia.org/wiki/Special:FilePath/Cardiff.jpg?width=1200',
    );
  });

  it('has nothing to store when Wikidata has no image', () => {
    expect(heroImageFrom(undefined)).toBeNull();
  });
});
