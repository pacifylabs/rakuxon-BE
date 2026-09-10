import { renderLayout } from './layout';

describe('renderLayout', () => {
  it('escapes HTML special characters, so a future template carrying user input cannot inject markup', () => {
    const { html } = renderLayout({
      preheader: 'p',
      heading: '<script>alert(1)</script>',
      paragraphs: ['Ada & "Bob" <b>bold</b>'],
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Ada &amp; &quot;Bob&quot; &lt;b&gt;bold&lt;/b&gt;');
  });

  it('carries the call-to-action link in both the HTML and the plain-text part', () => {
    const { html, text } = renderLayout({
      preheader: 'p',
      heading: 'Heading',
      paragraphs: ['Body.'],
      cta: { label: 'Click me', url: 'https://app.rakuxon.com/go' },
    });

    expect(html).toContain('href="https://app.rakuxon.com/go"');
    expect(html).toContain('Click me');
    expect(text).toContain('https://app.rakuxon.com/go');
  });

  it('includes the footnote when given one, and omits it otherwise', () => {
    const withFootnote = renderLayout({
      preheader: 'p',
      heading: 'Heading',
      paragraphs: ['Body.'],
      footnote: 'Expires soon.',
    });
    expect(withFootnote.html).toContain('Expires soon.');
    expect(withFootnote.text).toContain('Expires soon.');

    const withoutFootnote = renderLayout({ preheader: 'p', heading: 'Heading', paragraphs: ['Body.'] });
    expect(withoutFootnote.html).not.toContain('Expires soon.');
  });
});
