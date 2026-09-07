import { JwtService } from '@nestjs/jwt';

import { Role } from '../../contract/enums';
import { TokenService } from './token.service';
import type { Env } from '../../common/config/env.schema';

const env = {
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  JWT_ACCESS_TTL: 900,
  JWT_REFRESH_TTL: 1_209_600,
} as Env;

describe('TokenService', () => {
  const service = new TokenService(env, new JwtService());
  const claims = {
    sub: '11111111-1111-1111-1111-111111111111',
    tid: '22222222-2222-2222-2222-222222222222',
    role: Role.Counselor,
    email: 'counselor@example.com',
  };

  describe('access tokens', () => {
    it('round-trips its claims', async () => {
      const token = await service.signAccessToken(claims);
      const decoded = await service.verifyAccessToken(token);
      expect(decoded).toMatchObject(claims);
    });

    it('rejects a token signed with a different secret', async () => {
      const other = new TokenService({ ...env, JWT_ACCESS_SECRET: 'z'.repeat(32) } as Env, new JwtService());
      const foreign = await other.signAccessToken(claims);
      await expect(service.verifyAccessToken(foreign)).rejects.toThrow();
    });

    it('rejects a tampered token', async () => {
      const token = await service.signAccessToken(claims);
      await expect(service.verifyAccessToken(`${token}x`)).rejects.toThrow();
    });

    it('carries an expiry', async () => {
      const token = await service.signAccessToken(claims);
      const decoded = (await service.verifyAccessToken(token)) as unknown as { exp: number };
      expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe('refresh tokens', () => {
    it('is opaque: there is nothing for a client to read out of it', () => {
      const { token } = service.mintRefreshToken();
      expect(token).not.toContain('.');
      expect(() => JSON.parse(Buffer.from(token, 'base64url').toString())).toThrow();
    });

    it('carries enough entropy to be unguessable', () => {
      const { token } = service.mintRefreshToken();
      expect(Buffer.from(token, 'base64url')).toHaveLength(48);
    });

    it('never repeats', () => {
      const tokens = new Set(Array.from({ length: 200 }, () => service.mintRefreshToken().token));
      expect(tokens.size).toBe(200);
    });

    it('stores a hash, never the token itself', () => {
      const { token, tokenHash } = service.mintRefreshToken();
      expect(tokenHash).not.toBe(token);
      expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('hashes deterministically, so a presented token can be looked up', () => {
      const { token, tokenHash } = service.mintRefreshToken();
      expect(service.hashRefreshToken(token)).toBe(tokenHash);
    });

    it('sets the expiry from configuration', () => {
      const { expiresAt } = service.mintRefreshToken();
      const expected = Date.now() + env.JWT_REFRESH_TTL * 1000;
      expect(Math.abs(expiresAt.getTime() - expected)).toBeLessThan(2000);
    });
  });
});
