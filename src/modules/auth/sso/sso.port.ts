/**
 * An identity provider, reduced to what the platform needs.
 *
 * Keeping this an interface means no feature code imports a provider SDK, and
 * adding a second provider is a new adapter rather than a change to the auth
 * service — docs/04-architecture.md, "interfaces before providers".
 */
export interface SsoProfile {
  /** The provider's stable subject id. Not the email, which people change. */
  providerAccountId: string;
  email: string;
  fullName: string;
  /** Whether the provider vouches for the address. */
  emailVerified: boolean;
}

export interface SsoProvider {
  readonly name: string;
  /** Exchanges an authorization code for the signed-in profile. */
  exchangeCode(code: string, redirectUri: string): Promise<SsoProfile>;
}

export const SSO_PROVIDERS = Symbol('SSO_PROVIDERS');
