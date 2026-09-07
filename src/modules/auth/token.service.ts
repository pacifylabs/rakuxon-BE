import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { ENV } from '../../common/config/config.module';
import type { Env } from '../../common/config/env.schema';
import type { Role } from '../../contract/enums';

export interface AccessTokenClaims {
  /** User id. */
  sub: string;
  /** Null for platform_admin, who is not scoped to a tenant. */
  tid: string | null;
  role: Role;
  email: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Token minting.
 *
 * Access tokens are signed JWTs and are never stored. Refresh tokens are
 * opaque random strings — there is nothing for a client to read in them — and
 * only their SHA-256 is persisted, so a database leak yields no usable session.
 * SHA-256 is right here, not argon2: the token is 256 bits of entropy already,
 * so there is no dictionary to slow down, and refresh happens on a hot path.
 */
@Injectable()
export class TokenService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly jwt: JwtService,
  ) {}

  async signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return this.jwt.signAsync(claims, {
      secret: this.env.JWT_ACCESS_SECRET,
      expiresIn: this.env.JWT_ACCESS_TTL,
    });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    return this.jwt.verifyAsync<AccessTokenClaims>(token, {
      secret: this.env.JWT_ACCESS_SECRET,
    });
  }

  /** A fresh opaque refresh token and the hash to store against it. */
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
}
