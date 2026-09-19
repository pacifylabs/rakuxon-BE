import { interpolate } from './interpolate';

describe('interpolate', () => {
  it('replaces every token with its context value', () => {
    expect(interpolate('Hi {{name}}, your {{item}} is ready.', { name: 'Ada', item: 'passport' })).toBe(
      'Hi Ada, your passport is ready.',
    );
  });

  it('replaces the same token every time it repeats', () => {
    expect(interpolate('{{name}} and {{name}} again', { name: 'Ada' })).toBe('Ada and Ada again');
  });

  it('leaves a token with no matching context entry as literal text', () => {
    expect(interpolate('Hi {{name}}, {{missing}}.', { name: 'Ada' })).toBe('Hi Ada, {{missing}}.');
  });

  it('tolerates stray whitespace inside the braces', () => {
    expect(interpolate('Hi {{ name }}.', { name: 'Ada' })).toBe('Hi Ada.');
  });

  it('leaves text with no tokens untouched', () => {
    expect(interpolate('No tokens here.', {})).toBe('No tokens here.');
  });

  it('does not treat a context value containing braces as a nested token', () => {
    expect(interpolate('Says: {{quote}}', { quote: '{{not a token}}' })).toBe('Says: {{not a token}}');
  });
});
