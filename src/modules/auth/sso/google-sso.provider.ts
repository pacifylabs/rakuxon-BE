import { Injectable, UnauthorizedException } from '@nestjs/common';

import type { SsoProfile, SsoProvider } from './sso.port';

interface GoogleTokenResponse {
  id_token?: string;
}

interface GoogleIdTokenClaims {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

/**
 * Google sign-in.
 *
 * Exchanges the authorization code server-side, so the client secret never
 * reaches a browser. Only an id_token issued to us is accepted.
 *
 * NOTE: this decodes the id_token without verifying its signature, which is
 * safe only because the token came straight from Google's token endpoint over
 * TLS in the exchange above — not from the client. If this ever accepts a token
 * the client supplies, it MUST verify against Google's JWKS first.
 */
@Injectable()
export class GoogleSsoProvider implements SsoProvider {
  readonly name = 'google';

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  async exchangeCode(code: string, redirectUri: string): Promise<SsoProfile> {
    const response = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!response.ok) {
      throw new UnauthorizedException('Google rejected that sign-in.');
    }

    const { id_token: idToken } = (await response.json()) as GoogleTokenResponse;
    if (!idToken) throw new UnauthorizedException('Google returned no identity token.');

    const claims = this.decodeClaims(idToken);

    if (!claims.sub || !claims.email) {
      throw new UnauthorizedException('Google returned an incomplete profile.');
    }

    return {
      providerAccountId: claims.sub,
      email: claims.email,
      fullName: claims.name ?? claims.email,
      emailVerified: claims.email_verified === true,
    };
  }

  private decodeClaims(idToken: string): GoogleIdTokenClaims {
    const payload = idToken.split('.')[1];
    if (!payload) throw new UnauthorizedException('Google returned a malformed identity token.');

    try {
      return JSON.parse(Buffer.from(payload, 'base64url').toString()) as GoogleIdTokenClaims;
    } catch {
      throw new UnauthorizedException('Google returned a malformed identity token.');
    }
  }
}
