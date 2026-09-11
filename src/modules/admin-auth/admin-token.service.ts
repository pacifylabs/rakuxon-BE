import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { ENV } from '../../common/config/config.module';
import type { Env } from '../../common/config/env.schema';

export interface AdminAccessTokenClaims {
  /** Admin id. */
  sub: string;
  email: string;
  permissions: string[];
}

export interface TotpChallengeClaims {
  /** Admin id. */
  sub: string;
}

export interface IssuedAdminTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Token minting for admin sessions.
 *
 * Mirrors `TokenService` (`src/modules/auth/token.service.ts`) exactly in
 * shape, but signs with its own secret pair (`ADMIN_JWT_ACCESS_SECRET`/
 * `ADMIN_JWT_REFRESH_SECRET`) and carries a permission list instead of a role
 * — this is a deliberately separate class rather than a generalised shared
 * one, so admin and user tokens can never be verified against each other's
 * secret by a future refactor that forgets which is which.
 *
 * Permission keys are embedded in the access token at issuance, so a
 * permission check on a request never needs a database round trip — the same
 * tradeoff the users-side token already makes for role/tenantId.
 */
@Injectable()
export class AdminTokenService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly jwt: JwtService,
  ) {}

  async signAccessToken(claims: AdminAccessTokenClaims): Promise<string> {
    return this.jwt.signAsync(claims, {
      secret: this.env.ADMIN_JWT_ACCESS_SECRET,
      expiresIn: this.env.JWT_ACCESS_TTL,
    });
  }

  async verifyAccessToken(token: string): Promise<AdminAccessTokenClaims> {
    return this.jwt.verifyAsync<AdminAccessTokenClaims>(token, {
      secret: this.env.ADMIN_JWT_ACCESS_SECRET,
    });
  }

  mintRefreshToken(): { token: string; tokenHash: string; expiresAt: Date } {
    const token = randomBytes(48).toString('base64url');
    return {
      token,
      tokenHash: this.hashRefreshToken(token),
      expiresAt: new Date(Date.now() + this.env.JWT_REFRESH_TTL * 1000),
    };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  get accessTtlSeconds(): number {
    return this.env.JWT_ACCESS_TTL;
  }

  /**
   * A short-lived token proving "this password just checked out", handed
   * back instead of real tokens when the account has 2FA on — the second
   * `/admin-auth/login/verify-totp` call trades it, plus a TOTP or backup
   * code, for the real session.
   *
   * Signed with a secret *derived from*, but distinct from,
   * `ADMIN_JWT_ACCESS_SECRET` — a real access token can never verify
   * successfully as a challenge or vice versa, so a leaked challenge token
   * (it carries no permissions and is unusable on its own) can never be
   * replayed against a route that only checks `AdminJwtAuthGuard`.
   */
  async signTotpChallenge(adminId: string): Promise<string> {
    return this.jwt.signAsync({ sub: adminId }, { secret: this.totpChallengeSecret(), expiresIn: '5m' });
  }

  async verifyTotpChallenge(token: string): Promise<TotpChallengeClaims> {
    return this.jwt.verifyAsync<TotpChallengeClaims>(token, { secret: this.totpChallengeSecret() });
  }

  private totpChallengeSecret(): string {
    return createHash('sha256').update(`${this.env.ADMIN_JWT_ACCESS_SECRET}:totp-challenge`).digest('hex');
  }
}
