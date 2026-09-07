import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('produces an argon2id digest, not the plaintext', async () => {
    const digest = await service.hash('correct horse battery staple');
    expect(digest).toMatch(/^\$argon2id\$/);
    expect(digest).not.toContain('correct horse');
  });

  it('salts, so the same password hashes differently every time', async () => {
    const [a, b] = await Promise.all([service.hash('same-password'), service.hash('same-password')]);
    expect(a).not.toBe(b);
  });

  it('verifies a correct password', async () => {
    const digest = await service.hash('s3cret-passphrase');
    await expect(service.verify(digest, 's3cret-passphrase')).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const digest = await service.hash('s3cret-passphrase');
    await expect(service.verify(digest, 'not-the-password')).resolves.toBe(false);
  });

  it('returns false rather than throwing for an SSO-only account with no digest', async () => {
    await expect(service.verify(null, 'anything')).resolves.toBe(false);
    await expect(service.verify(undefined, 'anything')).resolves.toBe(false);
  });

  it('returns false rather than throwing on a malformed digest', async () => {
    await expect(service.verify('not-a-hash', 'anything')).resolves.toBe(false);
  });
});
