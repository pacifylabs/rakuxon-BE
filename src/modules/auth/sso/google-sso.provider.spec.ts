import { UnauthorizedException } from '@nestjs/common';

import { GoogleSsoProvider } from './google-sso.provider';

const idToken = (claims: Record<string, unknown>) =>
  `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

describe('GoogleSsoProvider', () => {
  const build = (fetchImpl: typeof fetch) =>
    new GoogleSsoProvider('client-id', 'client-secret', fetchImpl);

  it('exchanges the code and maps the profile', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      ok({
        id_token: idToken({
          sub: '1234567890',
          email: 'ada@example.com',
          email_verified: true,
          name: 'Ada Lovelace',
        }),
      }),
    );

    await expect(build(fetchImpl as never).exchangeCode('code', 'https://app/cb')).resolves.toEqual({
      providerAccountId: '1234567890',
      email: 'ada@example.com',
      fullName: 'Ada Lovelace',
      emailVerified: true,
    });
  });

  it('never puts the client secret in the URL', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(ok({ id_token: idToken({ sub: '1', email: 'a@b.test' }) }));

    await build(fetchImpl as never).exchangeCode('code', 'https://app/cb');
    const [url, init] = fetchImpl.mock.calls[0];

    expect(String(url)).not.toContain('client-secret');
    expect(String(init.body)).toContain('client_secret=client-secret');
  });

  it('falls back to the address when the provider sends no name', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(ok({ id_token: idToken({ sub: '1', email: 'a@b.test' }) }));

    const profile = await build(fetchImpl as never).exchangeCode('code', 'https://app/cb');
    expect(profile.fullName).toBe('a@b.test');
  });

  it('treats an unverified address as unverified rather than assuming', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(ok({ id_token: idToken({ sub: '1', email: 'a@b.test' }) }));

    const profile = await build(fetchImpl as never).exchangeCode('code', 'https://app/cb');
    expect(profile.emailVerified).toBe(false);
  });

  it('rejects a refused exchange', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response('{}', { status: 400 }));
    await expect(build(fetchImpl as never).exchangeCode('bad', 'https://app/cb')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a response with no identity token', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(ok({ access_token: 'only-this' }));
    await expect(build(fetchImpl as never).exchangeCode('code', 'https://app/cb')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a malformed identity token instead of crashing', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(ok({ id_token: 'not.a.jwt' }));
    await expect(build(fetchImpl as never).exchangeCode('code', 'https://app/cb')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a profile with no subject id', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(ok({ id_token: idToken({ email: 'a@b.test' }) }));
    await expect(build(fetchImpl as never).exchangeCode('code', 'https://app/cb')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
